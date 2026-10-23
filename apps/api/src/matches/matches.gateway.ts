import { HttpException } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { type Action, actionFor, eventsFor, RuleError, stateFor } from "@trends/game-core";
import type { Server, Socket } from "socket.io";
import { AuthService, type PublicUser } from "../auth/auth.service";
import type { MatchRow } from "../db/schema";
import { isInvited } from "../security";
import { MatchesService } from "./matches.service";

type Ack = { ok: true } | { ok: false; error: string };
type Client = Socket & { data: { user?: PublicUser } };

const corsOrigin = () => process.env.CORS_ORIGIN?.split(",") ?? true;

/**
 * オンライン対戦の通信。
 * - join：部屋に入る（再接続も同じ）。2人そろうと対戦が始まり、両者に "match" を送る
 * - action / resign：操作をサーバーで判定し、両者に "update" を送る
 * どちらの人にも、その人から見た形（自分が p1、相手の手札は隠す）で送る。
 */
@WebSocketGateway({ cors: { origin: corsOrigin() } })
export class MatchesGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;
  /** 対戦中（決着していない）の部屋の合言葉 */
  private playing = new Set<string>();

  constructor(
    private readonly auth: AuthService,
    private readonly matches: MatchesService,
  ) {}

  afterInit(server: Server) {
    // 招待リンクの守り：招待済みのクッキーが無い接続は、つなぐ前に断る
    server.use((socket, next) =>
      isInvited(socket.request) ? next() : next(new Error("招待リンクから開いてください")),
    );
  }

  /** いま人がつないでいる、決着していない対戦の数（デプロイで対戦を切らないように、/health で出す） */
  liveMatches(): number {
    const rooms = this.server?.sockets?.adapter?.rooms;
    if (!rooms) return 0;
    let n = 0;
    for (const code of this.playing) {
      if (rooms.get(code)?.size) n += 1;
      else this.playing.delete(code);
    }
    return n;
  }

  private track(code: string, live: boolean) {
    if (live) this.playing.add(code);
    else this.playing.delete(code);
  }

  async handleConnection(client: Client) {
    const user = await this.auth.verify(client.handshake.auth?.token);
    if (!user) {
      client.emit("auth_error", "ログインしてください");
      client.disconnect(true);
      return;
    }
    client.data.user = user;
  }

  @SubscribeMessage("join")
  async join(
    @ConnectedSocket() client: Client,
    @MessageBody() body: { code?: string; deck?: string },
  ): Promise<Ack> {
    return this.guard(client, async (user) => {
      const row = await this.matches.join(String(body?.code ?? ""), user.id, body?.deck);
      await client.join(row.code);
      await this.sendMatch(row);
    });
  }

  @SubscribeMessage("action")
  async action(
    @ConnectedSocket() client: Client,
    @MessageBody() body: { code?: string; action?: Action },
  ): Promise<Ack> {
    return this.guard(client, async (user) => {
      if (!body?.action) throw new RuleError("bad_action", "操作がありません");
      await this.apply(String(body.code ?? ""), user, body.action);
    });
  }

  @SubscribeMessage("resign")
  async resign(@ConnectedSocket() client: Client, @MessageBody() body: { code?: string }): Promise<Ack> {
    return this.guard(client, (user) =>
      this.apply(String(body?.code ?? ""), user, { type: "resign", player: "p1" }),
    );
  }

  private async apply(code: string, user: PublicUser, action: Action) {
    const r = await this.matches.act(code, user.id, action);
    this.track(r.row.code, !r.state.winner);
    const sockets = await this.server.in(r.row.code).fetchSockets();
    for (const s of sockets) {
      const viewer = s.data.user as PublicUser | undefined;
      if (!viewer) continue;
      const pid = this.matches.seat(r.row, viewer.id);
      s.emit("update", {
        action: actionFor(r.action, pid),
        events: eventsFor(r.events, pid),
        state: stateFor(r.state, pid),
      });
    }
  }

  /** 部屋の全員に、その人から見た対戦の様子を送る */
  private async sendMatch(row: MatchRow) {
    this.track(row.code, row.status === "playing");
    const info = await this.matches.info(row);
    const sockets = await this.server.in(row.code).fetchSockets();
    for (const s of sockets) {
      const viewer = s.data.user as PublicUser | undefined;
      if (!viewer) continue;
      const pid = this.matches.seat(row, viewer.id);
      const foe = pid === "p1" ? "p2" : "p1";
      s.emit("match", {
        code: row.code,
        status: row.status,
        me: info.players[pid],
        opponent: info.players[foe],
        state: row.state ? stateFor(row.state, pid) : null,
      });
    }
  }

  private async guard(client: Client, job: (user: PublicUser) => Promise<void>): Promise<Ack> {
    const user = client.data.user;
    if (!user) return { ok: false, error: "ログインしてください" };
    try {
      await job(user);
      return { ok: true };
    } catch (e) {
      if (e instanceof RuleError || e instanceof HttpException) return { ok: false, error: e.message };
      console.error(e);
      return { ok: false, error: "サーバーでエラーが起きました" };
    }
  }
}
