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
type Client = Socket & { data: { user?: PublicUser; room?: string } };

const corsOrigin = () => process.env.CORS_ORIGIN?.split(",") ?? true;
/** ランダムマッチの待ち行列を見直す間隔（待つほど組める幅が広がるので、定期的に見る） */
const QUEUE_SWEEP_MS = 2000;
/** CPU が 1 手ごとに置く間（画面が相手の手の演出を見せる分）。ターンの最初の 1 手は長めに */
const CPU_STEP_MS = 1200;
const CPU_TURN_START_MS = 2200;
/** 2 人とも部屋からいなくなってから、対戦を閉じるまでの間（リロード・アプリの切り替えくらいでは閉じないように） */
export const EMPTY_CLOSE_MS = 60_000;

/**
 * オンライン対戦の通信。
 * - join：部屋に入る（再接続も同じ）。2人そろうと対戦が始まり、両者に "match" を送る
 * - action / resign：操作をサーバーで判定し、両者に "update" を送る
 * - queue / unqueue：ランダムマッチの待ち行列に入る・出る。組めたら "matched"（合言葉）を送り、画面はその部屋に入る。
 *   しばらく待っても人と組めなければ、待機している CPU と組む（CPU は待ち行列に並ばないので、CPU どうしでは組まない）
 * 持ち時間はサーバーが持ち、時間が過ぎたらサーバーが代わりに操作する（自動の差し出し・時間切れ負け）。
 * 2 人とも抜けたまま（部屋にだれもつないでいない）EMPTY_CLOSE_MS たったら、決着なしで対戦を閉じる（CPU は人の数に入れない）。
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
  /** CPU の次の 1 手を打つタイマー（CPU との対戦の部屋ごと） */
  private cpuTimers = new Map<string, NodeJS.Timeout>();
  /** CPU が最後に手を打った通算ターン（ターンの最初の 1 手だけ間を長くする） */
  private cpuTurn = new Map<string, number>();
  /**
   * 部屋ごとに、手を進めてから送り終えるまでを1つずつ順に行う列。
   * 入り直した人に送る盤面が、あとの手より遅れて届いて、新しい盤面（決着）を古い盤面で上書きしないように
   */
  private rooms = new Map<string, Promise<unknown>>();
  private sweep: NodeJS.Timeout | null = null;
  /** だれもつないでいない部屋を閉じる時刻とタイマー（部屋ごと） */
  private closing = new Map<string, { at: number; timer: NodeJS.Timeout }>();
  /** 2 人とも抜けてから閉じるまでの間（テストで短くする） */
  closeAfterMs = EMPTY_CLOSE_MS;

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
        for (const row of rows) {
          this.schedule(row);
          void this.driveCpu(row);
          // 起動し直した直後はだれもつないでいない。時間内に戻らなければ閉じる
          this.watchEmpty(row.code);
        }
      })
      .catch((e) => console.error(e));
  }

  onModuleDestroy() {
    if (this.sweep) clearInterval(this.sweep);
    for (const t of [...this.timers.values(), ...this.cpuTimers.values()]) clearTimeout(t);
    for (const c of this.closing.values()) clearTimeout(c.timer);
    this.timers.clear();
    this.cpuTimers.clear();
    this.closing.clear();
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
    // 部屋から最後の 1 人がいなくなったら、閉じるまでの時間を数え始める
    if (client.data.room) this.watchEmpty(client.data.room);
  }

  /** 部屋にだれかつないでいるか */
  private present(code: string) {
    return !!this.server?.sockets?.adapter?.rooms?.get(code)?.size;
  }

  /** 部屋にだれもつないでいなければ、closeAfterMs 後に閉じる（もう数えていれば、そのまま） */
  private watchEmpty(code: string) {
    if (this.present(code) || this.closing.has(code)) return;
    const timer = setTimeout(
      () => void this.closeIfEmpty(code).catch((e) => console.error(e)),
      this.closeAfterMs + 20,
    );
    timer.unref();
    this.closing.set(code, { at: Date.now() + this.closeAfterMs, timer });
  }

  /** だれかが戻ったので、閉じるのをやめる */
  private keepOpen(code: string) {
    const c = this.closing.get(code);
    if (!c) return;
    clearTimeout(c.timer);
    this.closing.delete(code);
  }

  /** 閉じる時刻を過ぎても、だれもつないでいなければ対戦を閉じる。閉じたら true */
  private async closeIfEmpty(code: string): Promise<boolean> {
    const c = this.closing.get(code);
    if (!c || Date.now() < c.at) return false;
    this.keepOpen(code);
    if (this.present(code)) return false;
    const row = await this.matches.close(code);
    if (!row) return false;
    for (const timers of [this.timers, this.cpuTimers]) {
      const t = timers.get(code);
      if (t) clearTimeout(t);
      timers.delete(code);
    }
    this.cpuTurn.delete(code);
    this.track(code, false);
    return true;
  }

  /**
   * 通信が切れた人が戻る対戦（決着していない自分の対戦）と、2 人とも抜けていれば閉じるまでの残り。
   * 閉じる時刻を過ぎていれば、ここで閉じる（だれもつないでいないとタイマーが遅れることがあるので）
   */
  async resumable(userId: string) {
    for (let i = 0; i < 3; i++) {
      const row = await this.matches.current(userId);
      if (!row) break;
      if (await this.closeIfEmpty(row.code)) continue;
      this.watchEmpty(row.code);
      const c = this.closing.get(row.code);
      return { match: await this.matches.info(row), closesIn: c ? Math.max(0, c.at - Date.now()) : null };
    }
    return { match: null, closesIn: null };
  }

  @SubscribeMessage("join")
  async join(
    @ConnectedSocket() client: Client,
    @MessageBody() body: { code?: string; deck?: string },
  ): Promise<Ack> {
    const code = String(body?.code ?? "");
    return this.guard(client, (user) =>
      this.inRoom(code, async () => {
        const joined = await this.matches.join(code, user.id, body?.deck);
        await client.join(joined.code);
        client.data.room = joined.code;
        this.keepOpen(joined.code);
        // 送るのは、部屋の列の中で読んだ最新の盤面
        const row = await this.matches.find(joined.code);
        await this.sendMatch(row);
        // 入り直したときに時間が過ぎていれば、ここで進める
        this.schedule(row);
        void this.driveCpu(row);
      }),
    );
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

  /** 手番の人の画面が、ターンの始めまでの演出を見せ終えた。待っている時計を動かし、両者に新しい時計を送る */
  @SubscribeMessage("ready")
  async ready(
    @ConnectedSocket() client: Client,
    @MessageBody() body: { code?: string; turn?: number },
  ): Promise<Ack> {
    const code = String(body?.code ?? "");
    return this.guard(client, (user) =>
      this.inRoom(code, async () => {
        const row = await this.matches.ready(code, user.id, Number(body?.turn));
        if (!row?.state || !row.clock) return;
        const now = Date.now();
        const sockets = await this.server.in(row.code).fetchSockets();
        for (const s of sockets) {
          const viewer = s.data.user as PublicUser | undefined;
          if (!viewer) continue;
          s.emit("clock", clockFor(row.clock, row.state, now, this.matches.seat(row, viewer.id)));
        }
        this.schedule(row);
      }),
    );
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
      await this.matches.assertFree(user.id);
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

  /** 組める 2 人がいれば対戦を作り、2 人に合言葉を知らせる。長く待っても組めない人は CPU と組む */
  private async pairQueue() {
    if (this.queue.size === 0) return;
    const now = Date.now();
    for (const [a, b] of this.queue.take(now)) {
      try {
        const row = await this.matches.createRandom(a, b);
        for (const s of [a, b]) this.server.to(s.socketId).emit("matched", { code: row.code });
        this.schedule(row);
        // 2 人とも部屋に来なければ閉じる
        this.watchEmpty(row.code);
      } catch (e) {
        console.error(e);
        this.queue.putBack(a);
        this.queue.putBack(b);
      }
    }
    for (const a of this.queue.takeLonely(now)) {
      try {
        const row = await this.matches.createCpu(a);
        this.server.to(a.socketId).emit("matched", { code: row.code });
        this.schedule(row);
        void this.driveCpu(row);
        this.watchEmpty(row.code);
      } catch (e) {
        console.error(e);
        this.queue.putBack(a);
      }
    }
  }

  /** CPU との対戦で CPU の番なら、間を置いて 1 手打つ（打った手は broadcast から、また driveCpu に戻る） */
  private async driveCpu(row: MatchRow) {
    if (row.kind !== "cpu" || this.cpuTimers.has(row.code)) return;
    const state = row.state;
    const seat = await this.matches.cpuSeat(row);
    if (!seat || !state || state.winner || row.status !== "playing") return;
    const waiting = state.mulligan ?? state.pending;
    const mine = waiting ? waiting.waiting.includes(seat) : state.active === seat;
    if (!mine) return;
    // 対戦の始めは、時計が動き出す（オープニングが終わる・引き直しの時間が始まる）まで待つ
    const start = state.mulligan ? row.clock?.mulliganSince : row.clock?.since;
    const hold = start ? Math.max(0, start - Date.now()) : 0;
    const first = this.cpuTurn.get(row.code) !== state.turn;
    const t = setTimeout(
      () => {
        this.cpuTimers.delete(row.code);
        // 引き直しは数えない（そのあとの最初の手も、ターンの始めの間を置く）
        if (!state.mulligan) this.cpuTurn.set(row.code, state.turn);
        this.inRoom(row.code, async () => this.broadcast(await this.matches.cpuStep(row.code))).catch((e) =>
          console.error(e),
        );
      },
      hold + (first && !waiting ? CPU_TURN_START_MS : CPU_STEP_MS),
    );
    t.unref();
    this.cpuTimers.set(row.code, t);
  }

  private apply(code: string, user: PublicUser, action: Action) {
    return this.inRoom(code, async () => {
      const { steps, error } = await this.matches.act(code, user.id, action);
      await this.broadcast(steps);
      if (error) throw new RuleError("late", error);
    });
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
    if (last.state.winner) this.cpuTurn.delete(last.row.code);
    void this.driveCpu(last.row);
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
        this.inRoom(row.code, async () => {
          const { steps, row: now } = await this.matches.tick(row.code);
          // まだ切れていなければ（時計の誤差）、掛け直す
          if (steps.length) await this.broadcast(steps);
          else this.schedule(now);
        }).catch((e) => console.error(e));
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

  /** 部屋ごとの列に並べて、前の手を送り終えてから行う */
  private inRoom<T>(code: string, job: () => Promise<T>): Promise<T> {
    const key = code.toUpperCase();
    const prev = this.rooms.get(key) ?? Promise.resolve();
    const next = prev.then(job, job);
    const tail = next.catch(() => undefined);
    this.rooms.set(key, tail);
    void tail.then(() => {
      if (this.rooms.get(key) === tail) this.rooms.delete(key);
    });
    return next;
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
