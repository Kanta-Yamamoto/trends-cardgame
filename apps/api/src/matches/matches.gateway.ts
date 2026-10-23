import { HttpException, type OnModuleDestroy } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import {
  type Action,
  actionFor,
  clockDeadline,
  clockFor,
  eventsFor,
  RuleError,
  stateFor,
} from "@trends/game-core";
import type { Server, Socket } from "socket.io";
import { AuthService, type PublicUser } from "../auth/auth.service";
import type { MatchRow } from "../db/schema";
import { RankingService } from "../ranking/ranking.service";
import { isInvited } from "../security";
import { deckCards, MatchesService, type Step } from "./matches.service";
import { MatchQueue } from "./matchmaking";

type Ack = { ok: true } | { ok: false; error: string };
type Client = Socket & { data: { user?: PublicUser } };

const corsOrigin = () => process.env.CORS_ORIGIN?.split(",") ?? true;
/** ランダムマッチの待ち行列を見直す間隔（待つほど組める幅が広がるので、定期的に見る） */
const QUEUE_SWEEP_MS = 2000;

/**
 * オンライン対戦の通信。
 * - join：部屋に入る（再接続も同じ）。2人そろうと対戦が始まり、両者に "match" を送る
 * - action / resign：操作をサーバーで判定し、両者に "update" を送る
 * - queue / unqueue：ランダムマッチの待ち行列に入る・出る。組めたら "matched"（合言葉）を送り、画面はその部屋に入る
 * 持ち時間はサーバーが持ち、時間が過ぎたらサーバーが代わりに操作する（自動の差し出し・時間切れ負け）。
 * どちらの人にも、その人から見た形（自分が p1、相手の手札は隠す）で送る。
 */
@WebSocketGateway({ cors: { origin: corsOrigin() } })
export class MatchesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer() server!: Server;
  /** 対戦中（決着していない）の部屋の合言葉 */
  private playing = new Set<string>();
  /** 持ち時間が切れる時刻に動くタイマー（部屋ごと） */
  private timers = new Map<string, NodeJS.Timeout>();
  private queue = new MatchQueue();
  private sweep: NodeJS.Timeout | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly matches: MatchesService,
    private readonly ranking: RankingService,
  ) {}

  afterInit(server: Server) {
    // 招待リンクの守り：招待済みのクッキーが無い接続は、つなぐ前に断る
    server.use((socket, next) =>
      isInvited(socket.request) ? next() : next(new Error("招待リンクから開いてください")),
    );
    this.sweep = setInterval(() => void this.pairQueue(), QUEUE_SWEEP_MS);
    // 起動し直したときは、決着していない対戦のタイマーを掛け直す（だれも戻らない対戦も、時間切れで決着させる）
    void this.matches
      .playing()
      .then((rows) => {
        for (const row of rows) this.schedule(row);
      })
      .catch((e) => console.error(e));
  }

  onModuleDestroy() {
    if (this.sweep) clearInterval(this.sweep);
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
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

  handleDisconnect(client: Client) {
    this.queue.removeSocket(client.id);
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
      // 入り直したときに時間が過ぎていれば、ここで進める
      this.schedule(row);
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

  /** ランダムマッチの待ち行列に入る（デッキはここで確かめる） */
  @SubscribeMessage("queue")
  async enqueue(@ConnectedSocket() client: Client, @MessageBody() body: { deck?: string }): Promise<Ack> {
    return this.guard(client, async (user) => {
      deckCards(body?.deck);
      const { rating } = await this.ranking.ratingOf(user.id);
      this.queue.add({
        userId: user.id,
        socketId: client.id,
        deck: body?.deck as string,
        rating,
        since: Date.now(),
      });
      await this.pairQueue();
    });
  }

  @SubscribeMessage("unqueue")
  unqueue(@ConnectedSocket() client: Client): Ack {
    this.queue.removeSocket(client.id);
    return { ok: true };
  }

  /** 組める 2 人がいれば対戦を作り、2 人に合言葉を知らせる */
  private async pairQueue() {
    if (this.queue.size < 2) return;
    for (const [a, b] of this.queue.take(Date.now())) {
      try {
        const row = await this.matches.createRandom(a, b);
        for (const s of [a, b]) this.server.to(s.socketId).emit("matched", { code: row.code });
        this.schedule(row);
      } catch (e) {
        console.error(e);
        this.queue.putBack(a);
        this.queue.putBack(b);
      }
    }
  }

  private async apply(code: string, user: PublicUser, action: Action) {
    const { steps, error } = await this.matches.act(code, user.id, action);
    await this.broadcast(steps);
    if (error) throw new RuleError("late", error);
  }

  /** 進んだ手を、部屋の全員にその人から見た形で送る。決着でレーティングが動いたら、それも送る */
  private async broadcast(steps: Step[]) {
    const last = steps.at(-1);
    if (!last) return;
    const now = Date.now();
    this.track(last.row.code, !last.state.winner);
    const sockets = await this.server.in(last.row.code).fetchSockets();
    for (const r of steps)
      for (const s of sockets) {
        const viewer = s.data.user as PublicUser | undefined;
        if (!viewer) continue;
        const pid = this.matches.seat(r.row, viewer.id);
        s.emit("update", {
          action: actionFor(r.action, pid),
          events: eventsFor(r.events, pid),
          state: stateFor(r.state, pid),
          clock: r.row.clock ? clockFor(r.row.clock, r.state, now, pid) : null,
        });
        if (r.row.ratings && r.state.winner) s.emit("rated", r.row.ratings[pid]);
      }
    this.schedule(last.row);
  }

  /** 次に時間が切れる時刻にタイマーを掛ける（決着していたら外す） */
  private schedule(row: MatchRow) {
    const old = this.timers.get(row.code);
    if (old) clearTimeout(old);
    this.timers.delete(row.code);
    const at =
      row.clock && row.state && row.status === "playing" ? clockDeadline(row.clock, row.state) : null;
    if (at === null) return;
    const t = setTimeout(
      () => {
        this.timers.delete(row.code);
        this.matches
          .tick(row.code)
          // まだ切れていなければ（時計の誤差）、掛け直す
          .then(({ steps, row: now }) => (steps.length ? this.broadcast(steps) : this.schedule(now)))
          .catch((e) => console.error(e));
      },
      Math.max(0, at - Date.now()) + 20,
    );
    t.unref();
    this.timers.set(row.code, t);
  }

  /** 部屋の全員に、その人から見た対戦の様子を送る */
  private async sendMatch(row: MatchRow) {
    this.track(row.code, row.status === "playing");
    const info = await this.matches.info(row);
    const sockets = await this.server.in(row.code).fetchSockets();
    const now = Date.now();
    for (const s of sockets) {
      const viewer = s.data.user as PublicUser | undefined;
      if (!viewer) continue;
      const pid = this.matches.seat(row, viewer.id);
      const foe = pid === "p1" ? "p2" : "p1";
      s.emit("match", {
        code: row.code,
        status: row.status,
        kind: row.kind,
        me: info.players[pid],
        opponent: info.players[foe],
        state: row.state ? stateFor(row.state, pid) : null,
        clock: row.clock && row.state ? clockFor(row.clock, row.state, now, pid) : null,
        rating: row.ratings?.[pid] ?? null,
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
