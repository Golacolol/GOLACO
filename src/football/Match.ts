import * as THREE from "three";
import type { GameDatabase, SquadPlayer } from "../core/Database";
import type { EventBus } from "../core/EventBus";
import { hexColor, clamp, lerp, lerpAngle, normalize2, rotate2, stat01 } from "../core/math";
import type { FixtureRecord, KitChoice } from "../data/schema";
import { celebrateAI, celebrationStaysPut, clearCelebration, concedeReaction, type CelebrationRoutine } from "./ai/CelebrationAI";
import {
  updateGoalkeeper,
  decideKeeperDistribution,
  keeperHandReleaseVector,
  keeperOutletAimPoint,
  keeperPassDelivery,
  chooseGoalKickLongTarget,
  goalKickAimPoint,
  goalKickPowerScale,
} from "./ai/GoalkeeperAI";
import {
  choosePassTarget,
  interceptCandidate,
  isBackwardPass,
  passingLaneQuality,
  safePassDestination,
  throughBallAim,
} from "./ai/PassingAI";
import { tickStillPossession } from "./ai/StillPossession";
import { updateTeamAI } from "./ai/TeamAI";
import { containTarget, nearestPressTargets, pressTarget, jockeyTarget } from "./ai/DefensiveAI";
import {
  boxFinishDeadline,
  decideAttack,
  inOpponentPenaltyArea,
  isStriker,
  isWideAttacker,
  type AttackDecision,
} from "./ai/AttackingDecision";
import { isPlayStyleId, resolvePlayStyle, type PlayStyleId, type PlayStyleProfile } from "./ai/PlayStyle";
import { decisionTelemetry } from "./ai/DecisionTelemetry";
import { decideFreeKick } from "./ai/FreeKickDecision";
import { AI_CELEBRATION_SECONDS, chooseKickOffReceiver, KICK_OFF_PASS_DELAY, USER_CELEBRATION_MAX } from "./ai/KickOff";
import { planReceiveRun, receiveIsAerialOwned } from "./ai/ReceiveModel";
import { applySetPieceShape, chooseSetPieceScript, type SetPieceKind } from "./ai/SetPieceAI";
import { Ball } from "./ball/Ball";
import { clampBallSoft, dribbleBall, headerKick, inGoal, kickBall, outOfPitch, stepBall } from "./ball/BallPhysics";
import {
  aiAftertouchStrengthMul,
  aiCurveSide,
  openAftertouch,
  stepAftertouch,
  type AftertouchState,
} from "./ball/Aftertouch";
import { stepDribble } from "./ball/DribbleModel";
import { resolveGroundDuel, tryDefenderDisturbance } from "./ball/GroundContest";
import {
  PossessionActor,
  settleFirstTouch,
  strengthKickScale,
} from "./ball/PossessionActor";
import { crowdRicochetChance, nearbyDefenders, ricochetOffDefender } from "./ball/ShotContest";
import {
  aerialContestReach,
  aerialContestScore,
  headerKickVector,
  isAerialBall,
  pickAerialFlickTarget,
  resolveAerialDuel,
  shouldHeaderContest,
} from "./ball/AerialContest";
import { computePassError, holdPowerCurve, passKickVector, type PassType } from "./ball/PassModel";
import {
  bodyAlignment,
  facingKickFloor,
  firstTouchKickScale,
  idealPassHold01,
  kickCommitReady,
  receiveApproachAlignment,
} from "./ball/BodyMechanics";
import {
  applyFacingHints,
  idleBallFacingHint,
  moveFacingHint,
  receiveFacingHint,
  turnFacingToward,
} from "./players/FacingControl";
import { ballSpeed, isLegalStationary, isOutOfWorld, predictLanding } from "./ball/StuckBall";
import { aimOnGoal, aiShotAimIntent, computeShot } from "./ball/ShotModel";
import { MatchCamera, isPlayerView, nextTrack, nextView, supportsViewZoom, viewLabel } from "./camera/MatchCamera";
import {
  BALL_GRAVITY,
  BALL_RADIUS,
  GOAL_WIDTH,
  HALF_LENGTH,
  HALF_TIME_PAUSE,
  HALF_WIDTH,
  PENALTY_AREA_LENGTH,
  SPEED_BURST_SHOT_MUL,
} from "./constants";
import type { InputIntent } from "./controls/InputIntent";
import { FootballState } from "./FootballState";
import { defendGoalX, scorerForWorldGoal } from "./pitch/PitchEnds";
import { inPenaltyArea } from "./pitch/PitchZones";
import {
  isRestartState,
  planFoulRestart,
  planOffsideFreeKick,
  planRestart,
  restartDue,
  restartLabel,
  type RestartPlan,
} from "./Restarts";
import { offsideDepthM, offsideLineX, offsideRetreatTarget, playersOffsideAtPass } from "./rules/Offside";
import { teamMatchPhase, type MatchPhase } from "./ai/MatchBrain";
import { createGoalEvent, type GoalEvent } from "./GoalEvent";
import { defaultSpotKick, resolveSpotKick, type SpotKickPlacement } from "./practice/SpotKick";
import { MatchClock } from "./MatchClock";
import {
  clampInboundZ,
  TOUCHLINE_SAFE_MARGIN,
  throwInKickVector,
  throwInLanding,
  throwInMaxDistance,
  throwInReceiveSpot,
} from "./ThrowIn";
import {
  isSubstitutionWindow,
  subAnnounceDone,
  type PendingSubstitution,
  type SubAnnouncement,
} from "./Substitution";
import { staminaMatchDrainScale } from "./players/PlayerEnergy";
import { controlPlayer } from "./players/PlayerController";
import { autoSelectPlayer, cyclePlayer, selectSetPieceTaker } from "./players/PlayerSelection";
import { createPlayerVisual, portraitStackIndex, setBodyVisible, setControlledMarker, setHudMarker, setPassTargetMarker, setPortraitDecal, updatePlayerAnimation } from "./players/PlayerVisual";
import { computePressure } from "./players/PressureModel";
import {
  approachFromBehind,
  buildTackleContext,
  isDefensiveSlideRole,
  isThroughOnGoal,
  resolveLooseBallSlide,
  resolveTackle,
  shouldAiSlideTackle,
  slideAimDir,
  SLIDE_COMMIT_RANGE,
  SLIDE_CONTACT,
  SLIDE_DURATION,
  SLIDE_MIN_ENERGY,
  SLIDE_RECOVER_EARLY,
  SLIDE_RECOVER_MISS,
  SLIDE_SPEED,
  SLIDE_STAMINA_COST,
  tacklingStat,
  TACKLE_COOLDOWN,
  type TackleOutcome,
} from "./players/TackleModel";
import { movePlayer, separatePlayers, applyPitchBounds } from "./players/PlayerMovement";
import { JUMP_DURATION_CUE, JUMP_DURATION_HEADER, startJump } from "./players/PoseMotion";
import type { Player } from "./players/Player";
import { Stadium } from "./stadium/Stadium";
import { MatchOfficials, type OfficialsPhase } from "./stadium/MatchOfficials";
import { goalCrowdLevels } from "./stadium/Crowd";
import { Team } from "./teams/Team";
import { getFormation } from "./teams/Formation";
import { resolveMatchKits } from "./teams/KitClash";
import { hudFocusPlayers } from "./ui/HudFocus";
import { tuningFor, type GameplayTuning } from "./gameplay/GameplayTuning";
import {
  applyWeatherToTuning,
  lightingFromStadiumPreset,
  resolveEnvironment,
  type EnvironmentPreset,
  type TimeOfDay,
  type Weather,
} from "./environment/Environment";

export interface MatchOptions {
  fixture: FixtureRecord;
  preferredPlayerId?: string;
  userSide: "home" | "away";
  autoplay: boolean;
  invertShotY?: boolean;
  gameplayMode?: "REAL" | "ARCADE";
  timeOfDay?: TimeOfDay;
  weather?: Weather;
  graphicsPreset?: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  teamControl?: boolean;
  homeHudRing?: boolean;
  awayHudRing?: boolean;
  homeShowPortraits?: boolean;
  awayShowPortraits?: boolean;
  homePortraitOpacity?: number;
  awayPortraitOpacity?: number;
  homePortraitScale?: number;
  awayPortraitScale?: number;
  homePortraitUpright?: boolean;
  awayPortraitUpright?: boolean;
  homeHidePlayers?: boolean;
  awayHidePlayers?: boolean;
  ballGoldRing?: boolean;
  /** Highlight intended pass receiver while aiming. Default off. */
  showPassTargetHighlight?: boolean;
  /** Prematch Kit Select for the home club. */
  homeKitChoice?: KitChoice;
  /** Prematch Kit Select for the away club. */
  awayKitChoice?: KitChoice;
}

export class Match {
  state: FootballState = FootballState.PRE_MATCH;
  home: Team;
  away: Team;
  ball = new Ball();
  clock: MatchClock;
  camera: MatchCamera;
  stadium: Stadium;
  officials: MatchOfficials;
  homeScore = 0;
  awayScore = 0;
  controlled: Player;
  preferredPlayerId: string;
  teamControl = false;
  userSide: "home" | "away";
  possessing: Player | null = null;
  pressingId: string | null = null;
  lastGoal: GoalEvent | null = null;
  goals: GoalEvent[] = [];
  kickOffTime: string;
  practice: "none" | "spot" = "none";
  spotKick: SpotKickPlacement | null = null;
  autoplay: boolean;
  shotTarget: { x: number; y: number } | null = null;
  passTargetId: string | null = null;
  longPassLanding: { x: number; z: number } | null = null;
  passVector: { x: number; z: number } | null = null;
  shootCharge = 0;
  celebrationTime = 0;
  kickoffSide: "home" | "away" = "home";
  /** True in the second half after teams have swapped pitch ends. */
  endsFlipped = false;
  time = 0;
  scene: THREE.Scene;
  invertShotY: boolean;
  ballState: "owned" | "loose" | "restart" = "restart";
  possessionTime = 0;
  pressure = 0;
  currentTacklerId: string | null = null;
  cameraToast = "";
  cameraToastT = 0;
  showPassDebug = false;
  homeHudRing = false;
  awayHudRing = false;
  homeShowPortraits = false;
  awayShowPortraits = false;
  homePortraitOpacity = 0.85;
  awayPortraitOpacity = 0.85;
  homePortraitScale = 1;
  awayPortraitScale = 1;
  homePortraitUpright = false;
  awayPortraitUpright = false;
  homeHidePlayers = false;
  awayHidePlayers = false;
  ballGoldRing = false;
  showPassTargetHighlight = false;
  tuning: GameplayTuning;
  env: EnvironmentPreset;
  lastDecision: AttackDecision | null = null;
  gameplayMode: "REAL" | "ARCADE" = "REAL";
  homePlayStyle: PlayStyleProfile | null = null;
  awayPlayStyle: PlayStyleProfile | null = null;
  stats = {
    passes: 0,
    shortPasses: 0,
    longPasses: 0,
    /** Side-to-side switches with little forward progress (width > 16m, ahead < 10m). */
    crossFieldPasses: 0,
    tackles: 0,
    successfulTackles: 0,
    turnovers: 0,
    possessionChanges: 0,
    looseBalls: 0,
    stuckRecoveries: 0,
    completedPasses: 0,
    throughBalls: 0,
    crosses: 0,
    shots: 0,
    longShots: 0,
    offsides: 0,
    possessionDurations: [] as number[],
    /** Team-side possession spells (survives teammate-to-teammate passes; ends on turnover / long loose). */
    teamPossessionDurations: [] as number[],
    /** Sum of progressive pass distances (metres ahead of passer). */
    progressivePassDistance: 0,
    progressivePasses: 0,
    passDistanceSum: 0,
    /** Accumulated open-play seconds spent in each MatchBrain phase. */
    phaseSeconds: {
      defend: 0,
      loose: 0,
      transition: 0,
      build: 0,
      attack: 0,
      chance: 0,
    } as Record<MatchPhase, number>,
    /** Samples of ST→offside-line gap (metres onside = positive) during attack/chance. */
    stOffsideGapSamples: [] as number[],
    /** Approximate apex heights (m) from kick loft — fidelity gates. */
    passApexSamples: [] as number[],
    shotApexSamples: [] as number[],
    /** Outfield width (maxZ − minZ) samples while a side possesses. */
    teamWidthSamples: [] as number[],
  };
  debug = {
    fps: 0,
    inputX: 0,
    inputZ: 0,
    stuckTimer: 0,
    ballSpeed: 0,
  };
  private assistCandidate: string | null = null;
  private sceneRoot = new THREE.Group();
  private shotMarker: THREE.Mesh;
  private readonly slideTimed = new Map<string, boolean>();
  /** After a contested ground claim, the losing side cannot remagnet for a beat. */
  private contestLockSide: "home" | "away" | null = null;
  private contestLockT = 0;
  /** Brief window after a claim where the carrier can settle — no poke / remagnet scrum. */
  private possessionSecureT = 0;
  /** One resolving ball action per tick (kick / collect / header / tackle). */
  private readonly ballActor = new PossessionActor();
  /** Seconds since possession last changed side (or became owned from loose). */
  private possessionChangeAge = 99;
  /** Open-play clock for the current team-side possession spell. */
  private teamPossessionSpellT = 0;
  private teamPossessionLooseT = 0;
  private lastPossessingSide: "home" | "away" | null = null;
  /** Post-kick curve window — stick bends flight without resetting the kick. */
  private aftertouch: AftertouchState | null = null;
  private lastBallX = 0;
  private lastBallZ = 0;
  private stuckTimer = 0;
  /** Seconds a 3+ player slow-ball cling cluster has been active. */
  private ballClusterTimer = 0;
  private incomingAerial = false;
  private incomingShot = false;
  private passDebugLine: THREE.Line;
  private landMarker: THREE.Mesh;
  private aiAct = 0;
  private pendingPassFrom: string | null = null;
  private lastPassFrom: string | null = null;
  private recentPassIds: string[] = [];
  private idleHoldT = 0;
  private autoPassStreamT = 0;
  private restartElapsed = 0;
  private restartSpot: { x: number; z: number } | null = null;
  /**
   * Pre-kick ceremony: stands throw-back, GK walk-collect-place for goal kicks,
   * corner taker collect-carry-place, free-kick feed/collect/place.
   * While set, the restart clock does not auto-take.
   */
  private restartPrep: {
    kind: "goal_kick" | "stands_return" | "corner" | "free_kick";
    phase: "return" | "feed" | "collect" | "carry" | "place";
    plan: RestartPlan;
    exitX: number;
    exitZ: number;
    exitY: number;
    pickX: number;
    pickZ: number;
    t: number;
    takerId?: string;
    feederId?: string;
  } | null = null;
  /** After a throw-in, the thrower may not touch until another player does. */
  private throwInOpen = false;
  private throwInTakerId: string | null = null;
  /** Delay stepping the thrower onto the pitch so the throw pose reads. */
  private pendingThrowStepIn: { playerId: string; x: number; z: number; t: number } | null = null;
  private periodWhistleGrace = 0;
  private injuryAnnounced = false;
  private pendingSubs: PendingSubstitution[] = [];
  /** Active substitution HUD cards (home top-left, away top-right). */
  subAnnouncements: SubAnnouncement[] = [];
  private stateBeforePause: FootballState | null = null;
  private aiSubThinkT = 0;
  /** Teammates who were offside when the current open-play pass was struck. */
  private offsidePassIds = new Set<string>();
  private halfTimeT = 0;
  get halfTimeLeft(): number {
    return this.halfTimeT;
  }
  private switchLock = 0;
  private shotLock = false;
  private celebrationSteered = false;
  private celebrationRoutine: CelebrationRoutine = "corner";
  private spotResetT = 0;

  constructor(
    scene: THREE.Scene,
    camera: MatchCamera,
    db: GameDatabase,
    options: MatchOptions,
    private events: EventBus,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.userSide = options.userSide;
    this.autoplay = options.autoplay;
    this.invertShotY = options.invertShotY ?? false;
    const fixture = options.fixture;
    this.kickOffTime = fixture.time || "15:00";
    this.gameplayMode = options.gameplayMode ?? fixture.gameplayModeDefault ?? "REAL";
    const time = options.timeOfDay ?? fixture.timeOfDay ?? lightingFromStadiumPreset(db.getStadium(fixture.venueId).lightingPreset);
    const weather = options.weather ?? fixture.weather ?? "MILD";
    this.env = resolveEnvironment(time, weather);
    this.tuning = applyWeatherToTuning(tuningFor(this.gameplayMode), this.env);
    const homeTeam = db.getTeam(fixture.homeTeamId);
    const awayTeam = db.getTeam(fixture.awayTeamId);
    const homeLine = db.getLineup(fixture.homeLineupId, fixture.homeTeamId);
    const awayLine = db.getLineup(fixture.awayLineupId, fixture.awayTeamId);
    const homeSquad = db.getStartingSquad(homeLine);
    const awaySquad = db.getStartingSquad(awayLine);
    const kits = resolveMatchKits(homeTeam, awayTeam, {
      homeChoice: options.homeKitChoice,
      awayChoice: options.awayKitChoice,
    });
    this.home = new Team(homeTeam, homeLine, "home", homeSquad, db.getSquad(fixture.homeTeamId), kits.home);
    this.away = new Team(awayTeam, awayLine, "away", awaySquad, db.getSquad(fixture.awayTeamId), kits.away);
    this.homePlayStyle = resolvePlayStyle(homeTeam, this.home.players, homeLine.playStyle ?? null);
    this.awayPlayStyle = resolvePlayStyle(awayTeam, this.away.players, awayLine.playStyle ?? null);
    this.clock = new MatchClock(fixture.durationSeconds);
    const stadium = db.getStadium(fixture.venueId);
    this.stadium = new Stadium(scene, stadium, db.advertising, homeTeam.primaryColor, awayTeam.primaryColor, this.env, {
      home: kits.home,
      away: kits.away,
    });
    this.stadium.applyEnvironment(this.env, options.graphicsPreset ?? "HIGH");
    this.ball.setContrast(this.env.highContrastBall);
    this.preferredPlayerId = options.preferredPlayerId ?? this.userTeam().players.find((p) => !p.isGK)!.id;
    this.teamControl = options.teamControl ?? false;
    this.homeHudRing = options.homeHudRing ?? false;
    this.awayHudRing = options.awayHudRing ?? false;
    this.homeShowPortraits = options.homeShowPortraits ?? false;
    this.awayShowPortraits = options.awayShowPortraits ?? false;
    this.homePortraitOpacity = options.homePortraitOpacity ?? 0.85;
    this.awayPortraitOpacity = options.awayPortraitOpacity ?? 0.85;
    this.homePortraitScale = options.homePortraitScale ?? 1;
    this.awayPortraitScale = options.awayPortraitScale ?? 1;
    this.homePortraitUpright = options.homePortraitUpright ?? false;
    this.awayPortraitUpright = options.awayPortraitUpright ?? false;
    this.homeHidePlayers = options.homeHidePlayers ?? false;
    this.awayHidePlayers = options.awayHidePlayers ?? false;
    this.ballGoldRing = options.ballGoldRing ?? false;
    this.showPassTargetHighlight = options.showPassTargetHighlight ?? false;
    this.controlled = this.allPlayers().find((p) => p.id === this.preferredPlayerId) ?? this.userTeam().players[7];
    this.scene.add(this.sceneRoot);
    this.sceneRoot.add(this.ball.mesh);
    this.sceneRoot.add(this.ball.goldRing);
    this.spawnPlayers(homeSquad, awaySquad);
    this.officials = new MatchOfficials();
    this.sceneRoot.add(this.officials.group);
    this.shotMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.28, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    this.shotMarker.visible = false;
    this.sceneRoot.add(this.shotMarker);
    this.passDebugLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 1)]),
      new THREE.LineBasicMaterial({ color: 0x7dffc2 }),
    );
    this.passDebugLine.visible = false;
    this.landMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.62, 18),
      new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    this.landMarker.rotation.x = -Math.PI / 2;
    this.landMarker.visible = false;
    this.sceneRoot.add(this.passDebugLine, this.landMarker);
    this.resetKickoff("home");
    this.events.emit("MATCH_STARTED", { fixtureId: fixture.id });
  }

  get avgPossession(): number {
    const d = this.stats.possessionDurations;
    if (!d.length) return 0;
    return d.reduce((a, b) => a + b, 0) / d.length;
  }

  get maxPossession(): number {
    return this.stats.possessionDurations.reduce((a, b) => Math.max(a, b), 0);
  }

  get passCompletion(): number {
    return this.stats.passes ? (100 * this.stats.completedPasses) / this.stats.passes : 0;
  }

  allPlayers(): Player[] {
    return [...this.home.players, ...this.away.players].filter((p) => !p.sentOff);
  }

  userTeam(): Team {
    return this.userSide === "home" ? this.home : this.away;
  }

  applyFormation(name: string): void {
    this.userTeam().applyFormation(name);
    this.cameraToast = name;
    this.cameraToastT = 2.4;
  }

  /** Apply pause-menu formation edits: substitutions, shape, slot nudges, play-style. */
  applyTacticalEdit(
    edit: {
      formation: string;
      starters: { playerId: string; slot: string; offsetX?: number; offsetZ?: number }[];
      playStyle?: PlayStyleId | "auto" | null;
    },
    side: "home" | "away" = this.userTeam().side,
  ): { subsMade: number; formationChanged: boolean; subsQueued: number } {
    const team = side === "home" ? this.home : this.away;
    const formationChanged = edit.formation !== team.lineup.formation;
    const currentIds = team.players.map((p) => p.id);
    const nextIds = edit.starters.map((s) => s.playerId);
    const currentSet = new Set(currentIds);
    const nextSet = new Set(nextIds);
    const outs = team.players.filter((p) => !nextSet.has(p.id));
    const ins = nextIds
      .filter((id) => !currentSet.has(id))
      .map((id) => team.bench.find((s) => s.player.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s);

    const pairs: { offId: string; onId: string }[] = [];
    const usedIn = new Set<string>();
    for (const off of outs) {
      const match = ins.find((s) => !usedIn.has(s.player.id) && (s.player.primaryPosition === "GK") === off.isGK);
      if (!match) continue;
      usedIn.add(match.player.id);
      pairs.push({ offId: off.id, onId: match.player.id });
    }

    let queued = 0;
    for (const pair of pairs) {
      if (this.queueSubstitution(team.side, pair.offId, pair.onId)) queued += 1;
    }

    team.lineup.formation = edit.formation;
    const form = getFormation(edit.formation);
    const onPitch = new Set(team.players.map((p) => p.id));
    const pendingOff = new Set(this.pendingSubs.filter((s) => s.side === team.side).map((s) => s.offId));
    for (const row of edit.starters) {
      if (!onPitch.has(row.playerId) || pendingOff.has(row.playerId)) continue;
      const player = team.players.find((p) => p.id === row.playerId);
      const slot = form.find((f) => f.id === row.slot);
      if (!player || !slot) continue;
      player.slot = row.slot;
      team.placeAnchor(player, slot.x + (row.offsetX ?? 0), slot.z + (row.offsetZ ?? 0));
      player.x = player.anchorX;
      player.z = player.anchorZ;
      player.vx = 0;
      player.vz = 0;
    }
    team.lineup.starters = team.players.map((p) => {
      const fromEdit = edit.starters.find((s) => s.playerId === p.id);
      return {
        playerId: p.id,
        slot: p.slot,
        ...(fromEdit?.offsetX || fromEdit?.offsetZ
          ? { offsetX: fromEdit.offsetX, offsetZ: fromEdit.offsetZ }
          : {}),
      };
    });

    if (edit.playStyle !== undefined) {
      const override =
        edit.playStyle === "auto" || edit.playStyle === null || !isPlayStyleId(edit.playStyle)
          ? null
          : edit.playStyle;
      if (override) team.lineup.playStyle = override;
      else delete team.lineup.playStyle;
      const style = resolvePlayStyle(team.record, team.players, override);
      if (team.side === "home") this.homePlayStyle = style;
      else this.awayPlayStyle = style;
    }

    const pendingBefore = this.pendingCount(team.side);
    this.tryFlushPendingSubs();
    const stillQueued = this.pendingCount(team.side);
    const subsMade = Math.max(0, pendingBefore - stillQueued);
    const bits: string[] = [];
    if (formationChanged) bits.push(edit.formation);
    if (edit.playStyle && edit.playStyle !== "auto") bits.push(String(edit.playStyle).toUpperCase());
    else if (edit.playStyle === "auto") bits.push("STYLE AUTO");
    if (subsMade) bits.push(`${subsMade} SUB${subsMade === 1 ? "" : "S"}`);
    else if (stillQueued) bits.push(`${stillQueued} SUB${stillQueued === 1 ? "" : "S"} PENDING`);
    if (!bits.length) bits.push("LINE-UP UPDATED");
    this.cameraToast = bits.join(" · ");
    this.cameraToastT = 3.2;
    return { subsMade, formationChanged, subsQueued: stillQueued };
  }

  pendingCount(side: "home" | "away"): number {
    return this.pendingSubs.filter((s) => s.side === side).length;
  }

  subsRemaining(side: "home" | "away"): number {
    const team = side === "home" ? this.home : this.away;
    return Math.max(0, Team.MAX_SUBS - team.subsUsed - this.pendingCount(side));
  }

  queueSubstitution(side: "home" | "away", offId: string, onId: string): boolean {
    if (this.subsRemaining(side) <= 0) return false;
    const team = side === "home" ? this.home : this.away;
    const off = team.players.find((p) => p.id === offId);
    const incoming = team.bench.find((s) => s.player.id === onId);
    if (!off || !incoming) return false;
    if (off.isGK !== (incoming.player.primaryPosition === "GK")) return false;
    if (this.pendingSubs.some((s) => s.side === side && (s.offId === offId || s.onId === onId))) return false;
    this.pendingSubs.push({ side, offId, onId });
    return true;
  }

  substitute(offId: string, onId: string): boolean {
    return this.completeSubstitution(this.userSide, offId, onId);
  }

  enterPause(): void {
    if (this.state === FootballState.PAUSED) return;
    this.stateBeforePause = this.state;
    this.state = FootballState.PAUSED;
  }

  leavePause(): void {
    if (this.state !== FootballState.PAUSED) return;
    const next = this.stateBeforePause ?? FootballState.PLAYING;
    this.stateBeforePause = null;
    this.state = next === FootballState.PAUSED ? FootballState.PLAYING : next;
    this.tryFlushPendingSubs();
  }

  private canCompleteSubsNow(): boolean {
    if (this.state === FootballState.PAUSED) {
      const prior = this.stateBeforePause;
      return !!prior && this.isDeadBallState(prior);
    }
    return this.isDeadBallState(this.state);
  }

  private isDeadBallState(state: FootballState): boolean {
    return isSubstitutionWindow(state);
  }

  tryFlushPendingSubs(): void {
    if (!this.canCompleteSubsNow()) return;
    const remaining = [...this.pendingSubs];
    this.pendingSubs = [];
    for (const sub of remaining) {
      if (!this.completeSubstitution(sub.side, sub.offId, sub.onId)) {
        // Keep unfulfilled requests if still valid (e.g. temporary failure).
        if (this.subsRemaining(sub.side) > 0) this.pendingSubs.push(sub);
      }
    }
  }

  private completeSubstitution(side: "home" | "away", offId: string, onId: string): boolean {
    const team = side === "home" ? this.home : this.away;
    const off = team.players.find((p) => p.id === offId);
    if (!off) return false;
    if (this.possessing === off) this.makeLoose(off);
    const result = team.substitute(offId, onId);
    if (!result) return false;
    if (off.mesh) {
      this.sceneRoot.remove(off.mesh);
      off.mesh = null;
    }
    const kit = result.on.isGK ? team.record.goalkeeperKit : team.kit;
    const vis = createPlayerVisual(result.on, kit, result.on.isGK);
    result.on.mesh = vis.group;
    this.sceneRoot.add(vis.group);
    if (this.controlled === off) this.controlled = result.on;
    if (this.preferredPlayerId === off.id) this.preferredPlayerId = result.on.id;
    this.pushSubAnnouncement(side, result.off, result.on);
    this.events.emit("SUBSTITUTION", { outId: result.off.id, inId: result.on.id });
    return true;
  }

  private pushSubAnnouncement(side: "home" | "away", off: Player, on: Player): void {
    const team = side === "home" ? this.home : this.away;
    this.subAnnouncements.push({
      side,
      offName: off.displayName,
      offNumber: off.shirtNumber,
      onName: on.displayName,
      onNumber: on.shirtNumber,
      offPortrait: off.appearance.portraitAsset,
      onPortrait: on.appearance.portraitAsset,
      teamColor: team.record.primaryColor,
      age: 0,
    });
  }

  private tickSubAnnouncements(dt: number): void {
    const activeHome = this.subAnnouncements.find((a) => a.side === "home");
    const activeAway = this.subAnnouncements.find((a) => a.side === "away");
    if (activeHome) activeHome.age += dt;
    if (activeAway) activeAway.age += dt;
    this.subAnnouncements = this.subAnnouncements.filter((a) => !subAnnounceDone(a.age));
  }

  private thinkAiSubstitutions(dt: number): void {
    this.aiSubThinkT -= dt;
    if (this.aiSubThinkT > 0) return;
    this.aiSubThinkT = 3.2;
    if (this.practice !== "none") return;
    const prog = this.clock.duration > 0 ? this.clock.elapsed / this.clock.duration : 0;
    // Real-ish windows: ~30–40′, half-time, ~55–70′, late (~75′+). Avoid early spam.
    const inWindow =
      (prog >= 0.34 && prog < 0.46) ||
      (prog >= 0.5 && prog < 0.58) ||
      (prog >= 0.62 && prog < 0.78) ||
      prog >= 0.84;
    if (!inWindow) return;

    for (const team of [this.home, this.away]) {
      const aiControlled = this.autoplay || team.side !== this.userSide;
      if (!aiControlled) continue;
      const remaining = this.subsRemaining(team.side);
      if (remaining <= 0) continue;
      // Spread 3–5 changes over the match — don't dump the lot in one stoppage.
      const used = team.subsUsed + this.pendingCount(team.side);
      const targetByProg =
        prog < 0.5 ? 1 : prog < 0.65 ? 2 : prog < 0.82 ? 3 + (prog > 0.72 ? 1 : 0) : Math.min(5, 4 + (remaining > 0 ? 1 : 0));
      if (used >= targetByProg) continue;
      if (this.pendingCount(team.side) >= 2) continue;

      const pendingOff = new Set(this.pendingSubs.filter((s) => s.side === team.side).map((s) => s.offId));
      const energyFloor = prog < 0.55 ? 0.42 : prog < 0.75 ? 0.5 : 0.56;
      const tired = team.players
        .filter((p) => !p.isGK && !pendingOff.has(p.id) && p.energy.value < energyFloor)
        .sort((a, b) => a.energy.value - b.energy.value);

      const scoreDiff =
        team.side === "home" ? this.homeScore - this.awayScore : this.awayScore - this.homeScore;
      // Trailing late: freshen an attacker even if energy is only middling.
      let tacticalOff: (typeof team.players)[number] | null = null;
      if (scoreDiff < 0 && prog > 0.62) {
        const attackers = team.players
          .filter(
            (p) =>
              !p.isGK &&
              !pendingOff.has(p.id) &&
              (p.slot.includes("ST") ||
                p.slot.includes("W") ||
                p.slot.includes("AM") ||
                p.slot === "CAM" ||
                p.slot.includes("CM")),
          )
          .sort((a, b) => a.energy.value - b.energy.value);
        tacticalOff = attackers[0] ?? null;
      }

      const off = tired[0] ?? (tacticalOff && tacticalOff.energy.value < 0.72 ? tacticalOff : null);
      if (!off) continue;
      const candidates = team.bench.filter((s) => (s.player.primaryPosition === "GK") === off.isGK);
      if (!candidates.length) continue;
      candidates.sort((a, b) => b.overall - a.overall);
      let pick =
        candidates.find((s) => s.player.primaryPosition === off.position) ??
        candidates.find((s) => s.player.primaryPosition[0] === off.position[0]) ??
        candidates[0];
      // Trailing: prefer a forward/mid coming on.
      if (scoreDiff < 0 && prog > 0.62) {
        const attackBench = candidates.find((s) => {
          const pos = s.player.primaryPosition;
          return pos === "ST" || pos === "LW" || pos === "RW" || pos === "AM" || pos === "RM" || pos === "LM";
        });
        if (attackBench) pick = attackBench;
      }
      this.queueSubstitution(team.side, off.id, pick.player.id);
    }
  }

  private spawnPlayers(homeSquad: SquadPlayer[], awaySquad: SquadPlayer[]): void {
    void homeSquad;
    void awaySquad;
    for (const p of this.home.players) {
      const vis = createPlayerVisual(p, p.isGK ? this.home.record.goalkeeperKit : this.home.kit, p.isGK);
      p.mesh = vis.group;
      this.sceneRoot.add(vis.group);
    }
    for (const p of this.away.players) {
      const vis = createPlayerVisual(p, p.isGK ? this.away.record.goalkeeperKit : this.away.kit, p.isGK);
      p.mesh = vis.group;
      this.sceneRoot.add(vis.group);
    }
  }

  startPlay(): void {
    this.state = FootballState.KICK_OFF;
    this.clock.running = true;
    this.events.emit("KICKOFF", { kickingTeam: this.kickoffSide });
  }

  update(dt: number, intent: InputIntent): void {
    this.snapshotPoses();
    this.time += dt;
    if (this.autoplay && !this.holdsAutoplayState()) {
      this.state = this.clock.fullTime ? FootballState.FULL_TIME : FootballState.AUTOPLAY;
    }
    this.clock.update(dt, this.state);
    this.announceInjuryTime();
    this.tickSubAnnouncements(dt);
    this.thinkAiSubstitutions(dt);
    if (this.clock.halfTimeDue && this.state !== FootballState.GOAL_CELEBRATION && !isRestartState(this.state) && this.state !== FootballState.HALF_TIME) {
      if (this.canBlowPeriodWhistle(dt)) {
        this.state = FootballState.HALF_TIME;
        this.halfTimeT = HALF_TIME_PAUSE;
        this.periodWhistleGrace = 0;
        this.injuryAnnounced = false;
        this.tryFlushPendingSubs();
        this.events.emit("HALF_TIME", {});
      }
    }
    if (this.clock.fullTime && this.state !== FootballState.GOAL_CELEBRATION && !isRestartState(this.state)) {
      if (this.state !== FootballState.FULL_TIME && this.canBlowPeriodWhistle(dt)) {
        this.state = FootballState.FULL_TIME;
        this.periodWhistleGrace = 0;
        const homeWin = this.homeScore > this.awayScore;
        const draw = this.homeScore === this.awayScore;
        this.stadium.crowd.setReaction("HOME", homeWin || draw ? "cheer" : "down", homeWin ? 1 : draw ? 0.4 : 0.2);
        this.stadium.crowd.setReaction("AWAY", !homeWin && !draw ? "cheer" : draw ? "cheer" : "down", !homeWin && !draw ? 1 : draw ? 0.4 : 0.2);
        this.events.emit("FULL_TIME", { home: this.homeScore, away: this.awayScore });
      }
    }
    this.debug.inputX = intent.moveX;
    this.debug.inputZ = intent.moveZ;

    if (this.state === FootballState.PRE_MATCH) return;
    if (this.state === FootballState.HALF_TIME) {
      this.halfTimeT -= dt;
      this.camera.update(dt, this.ball, this.cameraFocusPlayer(), this.state);
      this.syncVisuals(dt);
      this.drawScoreboard();
      if (this.halfTimeT <= 0) this.beginSecondHalf();
      return;
    }
    if (this.state === FootballState.FULL_TIME) {
      this.camera.update(dt, this.ball, this.cameraFocusPlayer(), this.state);
      this.syncVisuals(dt);
      return;
    }
    if (this.state === FootballState.GOAL_CELEBRATION) {
      this.updateCelebration(dt, intent);
      this.camera.update(dt, this.ball, this.lastGoal ? this.playerById(this.lastGoal.scorerId) : this.cameraFocusPlayer(), this.state);
      this.syncVisuals(dt);
      this.drawScoreboard();
      return;
    }

    if (this.state === FootballState.KICK_OFF && intent.skip) {
      // Never abandon kick-off without a pass — that left the ball for the opponent.
      intent.skip = false;
    }

    if (intent.cycleView) {
      this.camera.setViewMode(nextView(this.camera.viewMode));
      this.toast(`VIEW: ${viewLabel(this.camera.viewMode)}`);
    }
    if (intent.cycleTrack) {
      this.camera.trackMode = nextTrack(this.camera.trackMode);
      this.toast(`CAMERA: ${this.camera.trackMode}`);
    }
    // +/- zoom on CLOSE / MEDIUM / WIDE (and the close bird's-eye).
    if (supportsViewZoom(this.camera.viewMode)) {
      if (intent.zoomIn) this.camera.adjustZoom(dt * 1.15);
      if (intent.zoomOut) this.camera.adjustZoom(-dt * 1.15);
    }
    this.cameraToastT = Math.max(0, this.cameraToastT - dt);

    // Practice spot free kicks reuse FREE_KICK state but stay in open play, not restart flow.
    if (isRestartState(this.state) && this.practice !== "spot") {
      this.stepRestart(dt, intent);
      this.camera.update(dt, this.ball, this.cameraFocusPlayer(), this.state);
      this.syncVisuals(dt);
      this.drawScoreboard();
      this.debug.ballSpeed = ballSpeed(this.ball);
      return;
    }

    this.ballActor.beginFrame();
    this.pressure = this.possessing ? computePressure(this.possessing, this.opponentsOf(this.possessing)).value : 0;
    this.switchLock = Math.max(0, this.switchLock - dt);
    {
      // Ignore null flicker (take→loose→take) so phase is not stuck on "transition".
      const side = this.possessing?.side ?? null;
      if (side != null && side !== this.lastPossessingSide) {
        if (this.lastPossessingSide != null && this.teamPossessionSpellT > 0.35) {
          this.stats.teamPossessionDurations.push(this.teamPossessionSpellT);
        }
        this.possessionChangeAge = 0;
        this.lastPossessingSide = side;
        this.teamPossessionSpellT = 0;
        this.teamPossessionLooseT = 0;
      } else {
        this.possessionChangeAge += dt;
        if (side != null) {
          this.lastPossessingSide = side;
          this.teamPossessionSpellT += dt;
          this.teamPossessionLooseT = 0;
        } else if (this.lastPossessingSide != null) {
          // Brief in-flight / 50-50 stays the same spell; extended loose ends it.
          this.teamPossessionLooseT += dt;
          this.teamPossessionSpellT += dt;
          if (this.teamPossessionLooseT > 2.2) {
            if (this.teamPossessionSpellT > 0.35) {
              this.stats.teamPossessionDurations.push(this.teamPossessionSpellT);
            }
            this.teamPossessionSpellT = 0;
            this.teamPossessionLooseT = 0;
            this.lastPossessingSide = null;
          }
        }
      }
    }
    if (this.teamControl && !this.autoplay && this.switchLock <= 0) {
      this.followTeamControl();
    }
    const skip = new Set<string>();
    const moveEx = this.moveExtras();
    const kickOff = this.state === FootballState.KICK_OFF;
    const userHasBall = !!this.possessing && this.possessing.side === this.userSide;
    const userPressing = !this.autoplay && !userHasBall && (intent.passHeld || intent.secondaryPressHeld);
    const pressRanked = userPressing
      ? nearestPressTargets(
          (this.userSide === "home" ? this.home.players : this.away.players).filter((p) => !p.sentOff),
          this.ball,
          2,
        )
      : [];
    const primaryPresser = intent.passHeld && !userHasBall && !this.autoplay ? pressRanked[0] ?? null : null;
    const secondaryPresser =
      intent.secondaryPressHeld && !userHasBall && !this.autoplay
        ? pressRanked.find((p) => p.id !== primaryPresser?.id) ?? (!intent.passHeld ? pressRanked[0] ?? null : null)
        : null;
    const forceClosers = [primaryPresser, secondaryPresser].filter((p): p is Player => !!p);

    const offsideControlled = !this.possessing && this.offsidePassIds.has(this.controlled.id);
    if (!this.autoplay) {
      if (offsideControlled) {
        skip.add(this.controlled.id);
      } else if (primaryPresser) {
        this.controlled = primaryPresser;
        this.driveUserPress(primaryPresser, dt, moveEx);
        skip.add(primaryPresser.id);
      } else {
        skip.add(this.controlled.id);
        const held = kickOff && this.possessing?.id === this.controlled.id;
        if (held) {
          const mx = intent.moveX;
          const mz = intent.moveZ;
          const sp = intent.sprint;
          const bo = intent.boost;
          intent.moveX = 0;
          intent.moveZ = 0;
          intent.sprint = false;
          intent.boost = false;
          if (!this.controlled.sliding && this.controlled.slideRecoverTimer <= 0) {
            controlPlayer(this.controlled, intent, dt, this.pressure, moveEx);
          }
          intent.moveX = mx;
          intent.moveZ = mz;
          intent.sprint = sp;
          intent.boost = bo;
        } else if (!this.controlled.sliding && this.controlled.slideRecoverTimer <= 0) {
          this.controlUserPlayer(this.controlled, intent, dt, moveEx);
        }
      }
    }

    if (intent.switchPlayer) {
      this.controlled = cyclePlayer(this.allPlayers(), this.userSide, this.controlled, this.ball.x, this.ball.z);
      this.switchLock = this.teamControl ? 1.35 : 0;
      this.events.emit("PLAYER_SELECTED", { playerId: this.controlled.id });
    }

    if (this.possessing) this.possessionTime += dt;
    else this.possessionTime = 0;
    for (const p of this.allPlayers()) {
      p.kickTimer = Math.max(0, p.kickTimer - dt);
      p.throwTimer = Math.max(0, p.throwTimer - dt);
      p.diveTimer = Math.max(0, p.diveTimer - dt);
      p.jumpTimer = Math.max(0, p.jumpTimer - dt);
      p.headerCooldown = Math.max(0, p.headerCooldown - dt);
      // Tick first-touch for everyone — only decaying on the owner left off-ball
      // players stuck on the receive/idle clip, so they slid with frozen legs.
      p.firstTouchTimer = Math.max(0, p.firstTouchTimer - dt);
      p.ballControlLockout = Math.max(0, p.ballControlLockout - dt);
      if (p.kickTimer <= 0) p.handRelease = false;
    }
    if (this.pendingThrowStepIn) {
      this.pendingThrowStepIn.t -= dt;
      if (this.pendingThrowStepIn.t <= 0) {
        const step = this.playerById(this.pendingThrowStepIn.playerId);
        if (step) {
          step.x = this.pendingThrowStepIn.x;
          step.z = this.pendingThrowStepIn.z;
          step.desiredX = step.x;
          step.desiredZ = step.z;
          step.vx = 0;
          step.vz = 0;
        }
        this.pendingThrowStepIn = null;
      }
    }

    this.updatePossession();
    this.applyStillPossessionSteal(dt);
    if (this.teamControl && !this.autoplay && this.switchLock <= 0 && !primaryPresser) {
      this.followTeamControl();
    }
    this.handleActions(intent, dt);
    this.handleTackles(intent);
    this.updateSlides(dt);
    this.handleInterceptions();

    const homePoss = this.possessing?.side ?? null;
    const homeSkip = this.userSide === "home" ? new Set(skip) : new Set<string>();
    const awaySkip = this.userSide === "away" ? new Set(skip) : new Set<string>();
    this.collectReceiverSkip(homeSkip, awaySkip);
    this.collectOffsideSkip(homeSkip, awaySkip);
    this.collectThrowInTakerSkip(homeSkip, awaySkip);
    this.steerThrowInTaker(dt);
    const userSide = this.userSide;
    // Recompute after handleActions — kick-off pass sets PLAYING mid-frame; a stale
    // kickOff flag was zeroing every outfielder on the opening kick.
    const aiKickOff = this.state === FootballState.KICK_OFF;
    const homeAI = updateTeamAI(this.allPlayers(), "home", this.ball, homePoss, dt, homeSkip, {
      tuning: this.tuning,
      grip: this.env.playerGripMultiplier,
      kickOff: aiKickOff,
      keeperHold: !!this.possessing?.isGK,
      setPiece: this.spotHoldContext(),
      forceClosers: userSide === "home" ? forceClosers : undefined,
      autoClosers: userSide !== "home" || this.autoplay,
      aggressivePress: userSide === "home" && forceClosers.length > 0,
      possessionChangeAge: this.possessionChangeAge,
      scoreDiff: this.homeScore - this.awayScore,
      minute01: clamp(this.clock.elapsed / Math.max(1, this.clock.duration), 0, 1),
      drainMul: this.tuning.staminaDrainMultiplier,
      matchDrainScale: staminaMatchDrainScale(this.clock.duration),
      playStyle: this.homePlayStyle ?? undefined,
    });
    const awayAI = updateTeamAI(this.allPlayers(), "away", this.ball, homePoss, dt, awaySkip, {
      tuning: this.tuning,
      grip: this.env.playerGripMultiplier,
      kickOff: aiKickOff,
      keeperHold: !!this.possessing?.isGK,
      setPiece: this.spotHoldContext(),
      forceClosers: userSide === "away" ? forceClosers : undefined,
      autoClosers: userSide !== "away" || this.autoplay,
      aggressivePress: userSide === "away" && forceClosers.length > 0,
      possessionChangeAge: this.possessionChangeAge,
      scoreDiff: this.awayScore - this.homeScore,
      minute01: clamp(this.clock.elapsed / Math.max(1, this.clock.duration), 0, 1),
      drainMul: this.tuning.staminaDrainMultiplier,
      matchDrainScale: staminaMatchDrainScale(this.clock.duration),
      playStyle: this.awayPlayStyle ?? undefined,
    });
    this.sampleFidelityMetrics(dt, homePoss);
    this.pressingId =
      primaryPresser?.id ??
      secondaryPresser?.id ??
      (this.possessing?.side === "home" ? awayAI : homeAI).pressingId;
    this.guideReceivers(dt);
    this.steerPassReceiver(dt);
    this.steerOffsideRetreat(dt);
    this.maybeAiTackle();
    const gkOpts = this.keeperSetPieceOpts();
    const boxTraffic = (side: "home" | "away") =>
      this.allPlayers().filter(
        (p) => p.side !== side && !p.isGK && p.distTo(this.ball.x, this.ball.z) < 4.2,
      ).length;
    const homeSave = updateGoalkeeper(this.home.gk(), this.ball, dt, this.tuning.keeperReactionMultiplier, {
      ...gkOpts.home,
      traffic: boxTraffic("home"),
      incomingShot: this.incomingShot,
      diveReachMul: this.tuning.keeperDiveReachMultiplier,
      holdBiasMul: this.tuning.keeperHoldBiasMultiplier,
    });
    const awaySave = updateGoalkeeper(this.away.gk(), this.ball, dt, this.tuning.keeperReactionMultiplier, {
      ...gkOpts.away,
      traffic: boxTraffic("away"),
      incomingShot: this.incomingShot,
      diveReachMul: this.tuning.keeperDiveReachMultiplier,
      holdBiasMul: this.tuning.keeperHoldBiasMultiplier,
    });
    if (homeSave === "hold" && this.possessing !== this.home.gk()) {
      const wasShot = this.incomingShot;
      this.takePossession(this.home.gk());
      this.faceKeeperToPlay(this.home.gk());
      this.incomingShot = false;
      if (wasShot) {
        this.toast("SAVE");
        this.stadium.crowd.setReaction("HOME", "cheer", 0.78);
        this.stadium.crowd.setReaction("AWAY", "down", 0.35);
      }
    }
    if (awaySave === "hold" && this.possessing !== this.away.gk()) {
      const wasShot = this.incomingShot;
      this.takePossession(this.away.gk());
      this.faceKeeperToPlay(this.away.gk());
      this.incomingShot = false;
      if (wasShot) {
        this.toast("SAVE");
        this.stadium.crowd.setReaction("AWAY", "cheer", 0.78);
        this.stadium.crowd.setReaction("HOME", "down", 0.35);
      }
    }
    if (homeSave === "parry" || awaySave === "parry") {
      this.incomingShot = false;
      this.toast("SAVE");
      this.stadium.crowd.setReaction(homeSave === "parry" ? "HOME" : "AWAY", "cheer", 0.72);
      this.stadium.crowd.setReaction(homeSave === "parry" ? "AWAY" : "HOME", "down", 0.28);
    }
    separatePlayers(this.allPlayers());
    for (const p of this.allPlayers()) applyPitchBounds(p);

    this.contestLockT = Math.max(0, this.contestLockT - dt);
    if (this.contestLockT <= 0) this.contestLockSide = null;
    this.possessionSecureT = Math.max(0, this.possessionSecureT - dt);

    this.applyAftertouchWindow(intent, dt);

    // Close defenders poke the ball — change speed/direction without sticky steal.
    // Skip while the new carrier is still settling (stops centre dual-fight flip-flops).
    // Dash / top-speed carries open the window earlier and raise poke strength.
    if (
      this.possessing &&
      !this.possessing.isGK &&
      this.possessionSecureT <= 0 &&
      this.state !== FootballState.KICK_OFF &&
      !isRestartState(this.state) &&
      !this.ballActor.resolved
    ) {
      const dash =
        this.possessing.sprinting && this.possessing.speed > 6.0
          ? clamp((this.possessing.speed - 5.5) / 4.5, 0, 1)
          : 0;
      const secureNeed = dash > 0.35 ? 0.45 : 2.55;
      if (this.possessionTime > secureNeed) {
      const disturb = tryDefenderDisturbance(
        this.ball,
        this.possessing,
        this.opponentsOf(this.possessing),
        this.tuning.defenderDisturbMultiplier * (0.32 + dash * 1.15),
        Math.random,
        dt,
      );
      if (disturb !== "none" && this.ballActor.tryClaim("disturb", this.possessing.id)) {
        if (disturb === "loose") {
          this.makeLoose(this.possessing);
        } else {
          // Long enough that the magnet cannot snap the ball straight back into the ring.
          this.possessing.ballControlLockout = Math.max(this.possessing.ballControlLockout, 0.48);
          this.possessing.firstTouchTimer = Math.max(this.possessing.firstTouchTimer, 0.22);
        }
      }
    }
    // Break 3+ player cling clusters around a slow ball (jitter / "everyone stuck to the ball").
    this.breakBallCluster(dt);

    if (this.state === FootballState.KICK_OFF && this.possessing) {
      this.ball.x = 0;
      this.ball.z = 0;
      this.ball.y = BALL_RADIUS;
      this.ball.vx = 0;
      this.ball.vz = 0;
      this.ball.vy = 0;
    } else if (this.possessing?.isGK) {
      const gk = this.possessing;
      // Ball cradled in the hands at chest height (not dribbled at the feet).
      const fx = Math.sin(gk.facing);
      const fz = Math.cos(gk.facing);
      this.ball.x = gk.x + fx * 0.32;
      this.ball.z = gk.z + fz * 0.32;
      this.ball.y = 1.08;
      this.ball.vx = 0;
      this.ball.vz = 0;
      this.ball.vy = 0;
      this.ball.ownerId = gk.id;
    } else if (
      this.possessing &&
      this.possessing.firstTouchTimer <= 0 &&
      this.possessing.ballControlLockout <= 0
    ) {
      const touch = stepDribble(this.ball, this.possessing, {
        pressure: this.pressure,
        dt,
        magnetMul: this.tuning.dribbleMagnetMultiplier,
        turnLooseMul: this.tuning.turnLooseMultiplier,
      });
      if (touch === "loose") this.makeLoose(this.possessing);
    } else if (
      this.possessing &&
      this.possessing.firstTouchTimer > 0 &&
      this.possessing.ballControlLockout <= 0 &&
      !this.possessing.isGK
    ) {
      // Soft settle still keeps the ball underfoot so a first touch can become a carry.
      const soft = stepDribble(this.ball, this.possessing, {
        pressure: this.pressure,
        dt,
        magnetMul: this.tuning.dribbleMagnetMultiplier * 0.85,
        turnLooseMul: this.tuning.turnLooseMultiplier * 0.7,
      });
      if (soft === "loose") {
        if (this.possessing.distTo(this.ball.x, this.ball.z) > 2.75) {
          this.makeLoose(this.possessing);
        } else {
          this.ball.vx *= 0.4;
          this.ball.vz *= 0.4;
        }
      }
    } else {
      stepBall(this.ball, dt, this.tuning.ballFrictionMultiplier, this.env.windZ);
      clampBallSoft(this.ball);
      if (this.possessing && this.possessing.ballControlLockout > 0) {
        // Still owned on paper, but ball flies free — lose if it runs away.
        if (
          !this.possessing.isGK &&
          this.possessing.distTo(this.ball.x, this.ball.z) > 2.65
        ) {
          this.makeLoose(this.possessing);
        }
      }
    }
    this.recoverStuckBall(dt);
    this.checkRestarts();
    if (this.practice === "spot") this.tickSpotKick(dt);
    this.assertSingleOwner();
    this.camera.update(dt, this.ball, this.cameraFocusPlayer(), this.state, { landing: this.longPassLanding });
    this.syncVisuals(dt);
    this.drawScoreboard();
    this.updateShotMarker(intent);
    this.updatePassDebug();
    this.debug.ballSpeed = ballSpeed(this.ball);
  }

  /**
   * Broadcast views track the controlled player; PLAYER view uses the selected player,
   * or in simulation the ball carrier (nearest chase while the ball is loose).
   */
  private cameraFocusPlayer(): Player {
    if (!isPlayerView(this.camera.viewMode)) return this.controlled;
    if (!this.autoplay) return this.controlled;
    if (this.possessing) return this.possessing;
    let best: Player | null = null;
    let bestD = Infinity;
    for (const p of this.allPlayers()) {
      const d = p.distTo(this.ball.x, this.ball.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ?? this.controlled;
  }

  private playerById(id: string): Player | null {
    return this.allPlayers().find((p) => p.id === id) ?? null;
  }

  private updatePossession(): void {
    // Retain radius > collect radius — prevents take/drop flicker (plan Phase 2).
    const retainRadius = 2.95;
    if (this.possessing && !this.possessing.isGK && this.possessing.distTo(this.ball.x, this.ball.z) > retainRadius) {
      this.makeLoose(this.possessing);
    }
    if (this.possessing) return;
    // Single ball-actor: a kick/header already claimed this frame, or ball still ripping.
    if (this.ballActor.resolved || this.ballActor.ballBusy(this.ball, this.ball.ownerId)) return;
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    if (speed > 14 && this.ball.y > 1.85) return;
    const aerial = isAerialBall(this.ball, this.incomingAerial);
    const challengers = this.aerialChallengers();
    // Cue jump poses for anyone contesting the flight.
    if (aerial && challengers.length) {
      for (const p of challengers) {
        if (p.jumpTimer < 0.06) {
          startJump(p, JUMP_DURATION_CUE + stat01(p.attrs.jumping ?? 50) * 0.04);
        }
      }
    }
    // Collect must be ≤ retain (stationary was 2.2 > drop 1.85 — caused flicker).
    const collectSpeed = aerial ? 1.85 : speed < 0.85 ? 1.55 : 1.42;
    const offsideTouch = this.offsidePlayerInReceiveRange(collectSpeed, speed);
    if (offsideTouch) {
      this.awardOffsideFoul(offsideTouch);
      return;
    }
    const duel =
      aerial && challengers.length
        ? resolveAerialDuel(
            challengers,
            this.ball,
            Math.random,
            this.tuning.headerContestUpsetMultiplier,
            this.tuning.headerTimingMultiplier,
          )
        : null;
    const contest = duel?.winner ?? this.contestForBall();
    if (!contest) return;
    const heightM = contest.height || 1.82;
    const designated = !!this.passTargetId && contest.id === this.passTargetId;
    const yCap = aerial ? Math.min(3.35, 1.55 + heightM * 0.85) : Math.min(1.72, 0.55 + heightM * 0.55);
    const speedCap = aerial
      ? 14 + (contest.attrs.jumping ?? contest.attrs.heading ?? 50) * 0.045
      : (designated ? 13.5 : 10) + contest.attrs.control * 0.06;
    const { reach } = aerial
      ? aerialContestReach(contest, speed)
      : {
          reach:
            collectSpeed *
            (designated ? 1.28 : 0.94 + Math.min(0.14, (heightM - 1.7) * 0.35)),
        };
    if (contest.distTo(this.ball.x, this.ball.z) < reach && speed < speedCap && this.ball.y < yCap) {
      const wasAerial = aerial || this.incomingAerial;
      const contested = !!duel?.contested || this.opponentsOf(contest).some((o) => o.distTo(this.ball.x, this.ball.z) < 2.6);
      if (
        wasAerial &&
        !contest.isGK &&
        shouldHeaderContest({
          ballY: this.ball.y,
          ballVy: this.ball.vy,
          ballSpeed: speed,
          contested,
          heading: stat01(contest.attrs.heading ?? contest.attrs.finishing),
          control: stat01(contest.attrs.control),
          incomingAerial: this.incomingAerial,
          headerCooldown: contest.headerCooldown,
        }) &&
        this.ballActor.tryClaim("header", contest.id) &&
        this.tryAerialRedirect(contest, contested)
      ) {
        this.incomingAerial = false;
        return;
      }
      if (!this.ballActor.tryClaim(contest.isGK ? "gk_claim" : "collect", contest.id)) return;
      this.takePossession(contest, wasAerial);
      this.incomingAerial = false;
    }
  }

  /** Players currently able to challenge an aerial ball. */
  private aerialChallengers(): Player[] {
    if (!isAerialBall(this.ball, this.incomingAerial)) return [];
    const ballSpeed = Math.hypot(this.ball.vx, this.ball.vz);
    const near: Player[] = [];
    for (const p of this.allPlayers()) {
      if (p.kickTimer > 0 || p.sentOff || p.isGK) continue;
      if (this.offsidePassIds.has(p.id)) continue;
      if (this.throwInOpen && this.throwInTakerId && p.id === this.throwInTakerId) continue;
      const { reach, yMax } = aerialContestReach(p, ballSpeed);
      if (p.distTo(this.ball.x, this.ball.z) < reach && this.ball.y < yMax + 0.15) near.push(p);
    }
    return near;
  }

  private contestForBall(): Player | null {
    const aerial = isAerialBall(this.ball, this.incomingAerial);
    const ballSpeed = Math.hypot(this.ball.vx, this.ball.vz);
    const near: Player[] = [];
    for (const p of this.allPlayers()) {
      if (p.kickTimer > 0) continue;
      if (this.offsidePassIds.has(p.id)) continue;
      // Throw-in taker must not reclaim until someone else has touched the ball.
      if (this.throwInOpen && this.throwInTakerId && p.id === this.throwInTakerId) continue;
      if (this.contestLockSide && p.side === this.contestLockSide && this.contestLockT > 0) continue;
      if (aerial) {
        const { reach, yMax } = aerialContestReach(p, ballSpeed);
        if (p.distTo(this.ball.x, this.ball.z) < reach && this.ball.y < yMax) near.push(p);
      } else {
        const reach = ballSpeed < 0.85 ? 2.2 : 1.45;
        if (p.distTo(this.ball.x, this.ball.z) < reach && this.ball.y < 1.7) near.push(p);
      }
    }
    if (near.length === 0) return null;
    if (aerial) {
      if (near.length === 1) return near[0]!;
      near.sort(
        (a, b) =>
          aerialContestScore(b, this.ball.x, this.ball.z, this.ball) -
          aerialContestScore(a, this.ball.x, this.ball.z, this.ball),
      );
      return near[0]!;
    }
    const duel = resolveGroundDuel(near, this.ball, Math.random, this.tuning.groundContestUpsetMultiplier, {
      // Prefer the side that just played the ball so passes aren't instantly flipped.
      favorSide: this.ball.lastTouchSide === "home" || this.ball.lastTouchSide === "away" ? this.ball.lastTouchSide : null,
      favorBonus: this.pendingPassFrom || this.passTargetId ? 0.55 : 0.28,
      // GK / restart outlets (often LB/RB) must win the claim vs rushing attackers.
      favorPlayerId: this.passTargetId,
      favorPlayerBonus: this.passTargetId ? 1.55 : 0,
    });
    if (!duel) return null;
    if (duel.contested) {
      const loserSide = duel.winner.side === "home" ? "away" : "home";
      this.contestLockSide = loserSide;
      this.contestLockT = Math.max(this.contestLockT, 0.78 + (1 - clamp(duel.margin, 0, 1.2)) * 0.42);
    }
    return duel.winner;
  }

  /**
   * Contested aerials: attackers flick / nod on; defenders clear.
   * Returns true when the ball was redirected without taking possession.
   */
  private tryAerialRedirect(winner: Player, contested = false): boolean {
    if (winner.isGK || this.ball.y < 1.28) return false;
    const head = stat01(winner.attrs.heading ?? winner.attrs.finishing);
    const distGoal = winner.distTo(winner.oppGoalX(), 0);
    const ownHalf = (winner.x - winner.ownGoalX()) * winner.attackSign < HALF_LENGTH;
    const duel = contested || this.opponentsOf(winner).some((o) => o.distTo(this.ball.x, this.ball.z) < 2.6);
    startJump(winner, JUMP_DURATION_HEADER + stat01(winner.attrs.jumping ?? 50) * 0.03);

    // Goal-mouth header when the ball is in the box and we're facing goal.
    if (!ownHalf && distGoal < 14 && Math.abs(winner.z) < 11 && (head > 0.48 || duel)) {
      const goalX = winner.oppGoalX();
      const aimZ = clamp(winner.z * 0.35 + (Math.random() - 0.5) * (2.8 - head * 1.6), -GOAL_WIDTH / 2 + 0.4, GOAL_WIDTH / 2 - 0.4);
      const kick = headerKickVector(winner, "goal", goalX, aimZ);
      headerKick(this.ball, kick.vx, kick.vz, {
        power: kick.power * (0.9 + head * 0.2),
        lift: kick.lift,
        scatter: (1 - head) * 2.2,
      });
      this.clearOwner();
      winner.headerCooldown = Math.max(winner.headerCooldown, 1.65);
      winner.kickTimer = 0.3;
      this.ball.lastTouchId = winner.id;
      this.ball.lastTouchSide = winner.side;
      this.pendingPassFrom = winner.id;
      this.assistCandidate = winner.id;
      this.incomingShot = true;
      this.incomingAerial = true;
      this.ballState = "loose";
      this.stats.shots += 1;
      this.events.emit("SHOT", { playerId: winner.id, power: kick.power });
      return true;
    }

    // Attacking flick-on toward a runner ahead of the ball.
    if (!ownHalf || distGoal < 40) {
      const flick = pickAerialFlickTarget(winner, this.teamOf(winner).players, this.ball.x, this.ball.z);
      if (flick && (duel || head > 0.48 || this.incomingAerial) && distGoal > 8) {
        const kick = headerKickVector(winner, "flick", flick.x, flick.z * 0.55 + this.ball.z * 0.45);
        headerKick(this.ball, kick.vx, kick.vz, {
          power: kick.power * (0.85 + head * 0.25),
          lift: kick.lift,
          scatter: (1 - head) * 2.6,
        });
        this.clearOwner();
        winner.headerCooldown = Math.max(winner.headerCooldown, 1.55);
        winner.kickTimer = 0.3;
        this.ball.lastTouchId = winner.id;
        this.ball.lastTouchSide = winner.side;
        this.pendingPassFrom = winner.id;
        this.assistCandidate = winner.id;
        this.passTargetId = flick.id;
        this.longPassLanding = { x: flick.x, z: flick.z };
        this.incomingAerial = true;
        this.ballState = "loose";
        return true;
      }
      // Soft nod into space when no flick runner — keep the ball alive aerially.
      if (duel || this.incomingAerial) {
        const nodX = winner.x + winner.attackSign * (6 + head * 4);
        const nodZ = winner.z * 0.6;
        const kick = headerKickVector(winner, "nod", nodX, nodZ);
        headerKick(this.ball, kick.vx, kick.vz, {
          power: kick.power,
          lift: kick.lift,
          scatter: (1 - head) * 2.0,
        });
        this.clearOwner();
        winner.headerCooldown = Math.max(winner.headerCooldown, 1.45);
        winner.kickTimer = 0.28;
        this.ball.lastTouchId = winner.id;
        this.ball.lastTouchSide = winner.side;
        this.pendingPassFrom = winner.id;
        this.incomingAerial = true;
        this.ballState = "loose";
        return true;
      }
    }

    // Defensive headed clearance when contested / high in our half.
    if (ownHalf && (duel || this.ball.y > 1.7) && !isStriker(winner)) {
      const away = winner.attackSign;
      const side = Math.sign(this.ball.z || (Math.random() - 0.5)) || 1;
      const aimX = winner.x + away * (18 + head * 10);
      const aimZ = winner.z + side * (8 + Math.random() * 6);
      const kick = headerKickVector(winner, "clear", aimX, aimZ);
      headerKick(this.ball, kick.vx, kick.vz, {
        power: kick.power,
        lift: kick.lift,
        scatter: (1 - head) * 2.4,
      });
      this.clearOwner();
      winner.headerCooldown = Math.max(winner.headerCooldown, 1.55);
      winner.kickTimer = 0.34;
      this.ball.lastTouchId = winner.id;
      this.ball.lastTouchSide = winner.side;
      this.pendingPassFrom = null;
      this.ballState = "loose";
      this.incomingAerial = true;
      return true;
    }
    return false;
  }

  private clearOwner(): void {
    if (this.possessing && this.possessionTime > 0.05) this.stats.possessionDurations.push(this.possessionTime);
    if (this.possessing) this.possessing.hasBall = false;
    for (const p of this.allPlayers()) p.hasBall = false;
    this.possessing = null;
    this.ball.ownerId = null;
    this.ballState = "loose";
    // Drop stale flight parking so TeamAI can chase the live ball again.
    this.longPassLanding = null;
    this.passTargetId = null;
  }

  private clearAftertouch(): void {
    this.aftertouch = null;
  }

  /** Stick bends a live kick mid-flight — never resets the base kick velocity. */
  private applyAftertouchWindow(intent: InputIntent, dt: number): void {
    if (!this.aftertouch) return;
    if (this.possessing || this.ball.ownerId) {
      this.clearAftertouch();
      return;
    }
    if (isRestartState(this.state) && this.practice !== "spot") {
      this.clearAftertouch();
      return;
    }
    // Prefer aim stick; fall back to move (same as SWOS joystick after release).
    const stickX = Math.abs(intent.aimX) + Math.abs(intent.aimY) > 0.14 ? intent.aimX : intent.moveX;
    const stickZ = Math.abs(intent.aimX) + Math.abs(intent.aimY) > 0.14 ? intent.aimY : intent.moveZ;
    const result = stepAftertouch(this.ball, this.aftertouch, stickX, stickZ, dt);
    this.aftertouch = result.state;
  }

  private makeLoose(from?: Player): void {
    if (from) from.hasBall = false;
    this.clearOwner();
    this.stats.looseBalls += 1;
    this.longPassLanding = null;
  }

  private takePossession(player: Player, aerial = false): void {
    const fromId = this.pendingPassFrom;
    const from = fromId ? this.playerById(fromId) : null;
    if (this.throwInOpen && this.throwInTakerId && player.id === this.throwInTakerId) {
      this.awardThrowInRetouchFoul(player);
      return;
    }
    if (this.throwInOpen && player.id !== this.throwInTakerId) {
      this.throwInOpen = false;
      this.throwInTakerId = null;
    }
    // Any touch by a player flagged offside at the pass is interference.
    if (this.offsidePassIds.has(player.id)) {
      this.awardOffsideFoul(player);
      return;
    }
    if (this.offsidePassIds.size) this.clearOffsidePhase();
    const prev = this.possessing;
    if (prev && prev.side !== player.side) {
      this.lastPassFrom = null;
      this.recentPassIds = [];
      this.assistCandidate = null;
    }
    this.idleHoldT = 0;
    this.clearOwner();
    this.clearAftertouch();
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    const pressure = computePressure(player, this.opponentsOf(player)).value;
    const style = (player.side === "home" ? this.homePlayStyle : this.awayPlayStyle) ?? undefined;
    const approach = receiveApproachAlignment(player.facing, this.ball.vx, this.ball.vz);
    // Always settle paced / contested / aerial receives — not only hard passes.
    if (speed > 2.2 || aerial || this.ball.y > 0.72 || pressure > 0.42) {
      const touch = settleFirstTouch(this.ball, {
        control: player.attrs.control,
        strength: player.attrs.strength,
        pressure,
        energy: player.energy.value,
        aerial: aerial || this.ball.y > 1.4,
        errorMul: this.tuning.firstTouchErrorMultiplier,
        facing: player.facing,
        approachAlignment: approach,
        receivePatience: style?.receivePatience,
      });
      player.firstTouchTimer = touch.firstTouchTimer;
      if (touch.lost) {
        this.ballState = "loose";
        this.stats.looseBalls += 1;
        player.ballControlLockout = Math.max(player.ballControlLockout, 0.28);
        return;
      }
    } else {
      // Soft receive still needs a short plant before the next kick.
      player.firstTouchTimer = Math.max(
        player.firstTouchTimer,
        (0.08 + (1 - stat01(player.attrs.control)) * 0.1) * (0.85 + (style?.receivePatience ?? 0.45) * 0.35),
      );
    }
    this.possessing = player;
    player.hasBall = true;
    player.ballControlLockout = 0;
    this.ball.ownerId = player.id;
    this.ball.lastTouchId = player.id;
    this.ball.lastTouchSide = player.side;
    this.ballState = "owned";
    this.possessionTime = 0;
    // Let the first touch settle before pokes start another midfield flip-flop.
    this.possessionSecureT = Math.max(this.possessionSecureT, aerial ? 1.05 : 1.95);
    this.stats.possessionChanges += 1;
    this.passTargetId = null;
    this.longPassLanding = null;
    if (player.isGK) this.faceKeeperToPlay(player);
    if (from && from.side === player.side && from.id !== player.id) this.stats.completedPasses += 1;
    this.pendingPassFrom = null;
    if (!this.autoplay && player.side === this.userSide && !player.isGK && this.state !== FootballState.KICK_OFF) {
      this.controlled = player;
    }
  }

  private passForbidIds(passer: Player): string[] {
    const ids = this.recentPassIds.filter((id) => id !== passer.id);
    // Always block an immediate bounce-back to the teammate who just passed it in.
    if (this.lastPassFrom && this.lastPassFrom !== passer.id && !ids.includes(this.lastPassFrom)) {
      ids.push(this.lastPassFrom);
    }
    const opponents = this.opponentsOf(passer);
    for (const mate of this.teamOf(passer).players) {
      if (mate.id === passer.id || mate.isGK) continue;
      // Only hard-block deeply offside mates — stretchers stay passable (risk → flag).
      if (offsideDepthM(mate, passer.x, opponents) > 2.8 && !ids.includes(mate.id)) ids.push(mate.id);
    }
    return [...new Set(ids)];
  }

  private applyStillPossessionSteal(dt: number): void {
    const playing = this.state === FootballState.PLAYING || this.state === FootballState.AUTOPLAY;
    const result = tickStillPossession({
      holder: this.possessing,
      opponents: this.possessing ? this.opponentsOf(this.possessing) : [],
      dt,
      prevStill: this.idleHoldT,
      playing,
    });
    this.idleHoldT = result.stillTime;
    if (result.steal) this.takePossession(result.steal);
  }

  private assertSingleOwner(): void {
    const owners = this.allPlayers().filter((p) => p.hasBall);
    if (owners.length > 1) {
      for (const p of owners) if (p.id !== this.possessing?.id) p.hasBall = false;
    }
    if (this.possessing && this.ball.ownerId && this.possessing.id !== this.ball.ownerId) {
      this.ball.ownerId = this.possessing.id;
    }
  }

  private handleActions(intent: InputIntent, dt: number): void {
    const passer = this.possessing;
    if (!passer) {
      this.shootCharge = 0;
      this.autoPassStreamT = 0;
      if ((intent.tackle || intent.shoot) && this.controlled.side === this.userSide) {
        this.beginSlideChallenge(this.controlled, true);
      }
      return;
    }
    const userOnBall = passer.id === this.controlled.id && !this.autoplay;
    if (this.shotLock && !intent.shootHeld) this.shotLock = false;
    if (passer.isGK) {
      this.shootCharge = 0;
      this.autoPassStreamT = 0;
      if (userOnBall && (intent.pass || intent.through || intent.cross || intent.shoot || intent.passHold > 0.85)) {
        this.handleUserKeeperRelease(passer, intent);
        return;
      }
      this.thinkKeeperDistribution(passer, dt);
      return;
    }
    if (!userOnBall) {
      this.autoPassStreamT = 0;
      if (this.state === FootballState.KICK_OFF) this.thinkKickOff(passer, dt);
      else this.thinkAttack(passer, dt);
      return;
    }
    if (this.state === FootballState.KICK_OFF) {
      this.shootCharge = 0;
      if (intent.pass || intent.through || intent.cross || intent.passHeld) {
        if (intent.passHeld && passer.kickTimer > 0) return;
        if (intent.passHeld) {
          this.autoPassStreamT += dt;
          if (this.autoPassStreamT < 0.1 && !intent.through && !intent.cross && !intent.pass) return;
          this.autoPassStreamT = 0;
        }
        const back = chooseKickOffReceiver(passer, this.teamOf(passer).players);
        const aimed = Math.hypot(intent.aimX, intent.aimY) > 0.2;
        const dir = aimed
          ? this.aimDir(intent, passer)
          : back
            ? normalize2(back.x - passer.x, back.z - passer.z)
            : { x: -passer.attackSign, z: 0 };
        const target = aimed
          ? choosePassTarget(
              passer,
              this.teamOf(passer).players,
              this.opponentsOf(passer),
              this.ball,
              dir.x,
              dir.z,
              "short",
              { forbidIds: this.passForbidIds(passer) },
            )
          : back;
        this.executePass(passer, target, intent, "short", dir);
      } else if (this.possessionTime > 0.95) {
        // Idle user on the spot — auto-open rather than leave the ball for opponents.
        this.thinkKickOff(passer, dt);
      }
      return;
    }
    if (intent.shootHeld || intent.shoot) this.shotTarget = aimOnGoal(intent.aimX, intent.aimY, this.invertShotY);
    else this.shotTarget = null;
    this.shootCharge = intent.shootHeld || intent.shoot ? clamp(intent.shootHold / 1.15, 0, 1.25) : 0;

    const dir = this.aimDir(intent, passer);
    const streamPass = intent.passHeld;
    const passType: PassType = intent.chip
      ? "chip"
      : intent.through
        ? "through"
        : intent.cross
          ? "cross"
          : !streamPass && intent.passHold > 0.55
            ? "long"
            : "short";
    const target = choosePassTarget(
      passer,
      this.teamOf(passer).players,
      this.opponentsOf(passer),
      this.ball,
      dir.x,
      dir.z,
      passType === "chip" ? "through" : passType,
      { forbidIds: this.passForbidIds(passer) },
    );
    this.passTargetId = target?.id ?? null;
    this.passVector = dir;

    // First-touch plant: no clean pass/shot until the ball settles under the foot.
    const canKick = kickCommitReady(passer.firstTouchTimer, passer.kickTimer, 0.1);
    if (!canKick && (intent.pass || intent.through || intent.cross || intent.chip || intent.shoot || intent.shootHeld || streamPass)) {
      this.autoPassStreamT = 0;
      // Allow a forced mishit only deep into settle with a hard press — otherwise wait.
      if (passer.firstTouchTimer > 0.18 && !intent.shootHeld) return;
    }
    if (!this.shotLock && intent.shootHeld && intent.shootHold >= 1.28) {
      if (!canKick && passer.firstTouchTimer > 0.12) return;
      this.shotLock = true;
      this.executeShot(passer, intent, false, true);
      return;
    }
    if (intent.chip || intent.through || intent.cross) {
      if (!canKick) return;
      this.autoPassStreamT = 0;
      this.executePass(passer, target, intent, passType, dir);
      return;
    }
    if (streamPass) {
      if (passer.kickTimer > 0 || !canKick) {
        this.autoPassStreamT = 0;
        return;
      }
      this.autoPassStreamT += dt;
      if (this.autoPassStreamT >= 0.1) {
        this.autoPassStreamT = 0;
        this.executePass(passer, target, intent, "short", dir);
      }
      return;
    }
    this.autoPassStreamT = 0;
    if (intent.pass) {
      if (!canKick) return;
      this.executePass(passer, target, intent, passType, dir);
    } else if (!this.shotLock && intent.shoot) {
      if (!canKick) return;
      this.shotLock = true;
      this.executeShot(passer, intent);
    }
  }

  private driveUserPress(
    presser: Player,
    dt: number,
    moveEx: ReturnType<Match["moveExtras"]>,
  ): void {
    const goalX = presser.ownGoalX();
    const target = pressTarget(presser, this.ball.x, this.ball.z, goalX);
    presser.desiredX = target.x;
    presser.desiredZ = target.z;
    const dx = target.x - presser.x;
    const dz = target.z - presser.z;
    const dist = Math.hypot(dx, dz);
    movePlayer(presser, dt, dx, dz, dist > 1.2, false, {
      hasBall: false,
      pressure: 0,
      ...moveEx,
      speedMul: (moveEx.speedMul ?? 1) * 1.08,
    });
  }

  private thinkAttack(passer: Player, dt: number): void {
    const decision = decideAttack({
      carrier: passer,
      teammates: this.teamOf(passer).players,
      opponents: this.opponentsOf(passer),
      ball: this.ball,
      possessionTime: this.possessionTime,
      pressure: this.pressure,
      tuning: this.tuning,
      forbidIds: this.passForbidIds(passer),
      playStyle: (passer.side === "home" ? this.homePlayStyle : this.awayPlayStyle) ?? undefined,
    });
    this.lastDecision = decision;
    if (decisionTelemetry.enabled) {
      const scores = decision.scores;
      decisionTelemetry.record({
        type:
          decision.action === "SHOT" || decision.action === "LONG_SHOT"
            ? "SHOT_DECISION"
            : decision.action === "RUN" || decision.action === "HOLD"
              ? "RUN_DECISION"
              : "PASS_DECISION",
        simulationTime: this.clock.elapsed,
        playerId: passer.id,
        teamId: passer.side,
        playerPosition: passer.slot,
        playerVelocity: { x: passer.vx, z: passer.vz },
        playerFacing: passer.facing,
        currentEnergy: passer.energy.value,
        ballPosition: { x: this.ball.x, y: this.ball.y, z: this.ball.z },
        pressure: this.pressure,
        availableActions: ["PASS", "THROUGH", "LONG_PASS", "CROSS", "RUN", "SHOT", "LONG_SHOT", "HOLD"],
        actionScores: {
          pass: scores.passScore,
          run: scores.runScore,
          shot: scores.shotScore,
          longShot: scores.longShotScore,
          through: scores.throughBallScore,
          longPass: scores.longPassScore,
          cross: scores.crossScore,
          hold: scores.holdScore,
        },
        chosenAction: decision.action,
        targetPlayerId: decision.passTarget?.id ?? null,
        targetPosition: decision.passTarget
          ? { x: decision.passTarget.x, z: decision.passTarget.z }
          : { x: passer.runTargetX, z: passer.runTargetZ },
        relevantAttributes: {
          vision: passer.attrs.vision,
          passing: passer.attrs.passing,
          longPassing: passer.attrs.longPassing,
          attackingAwareness: passer.attrs.attackingAwareness ?? 0,
          pace: passer.attrs.pace,
          acceleration: passer.attrs.acceleration ?? passer.attrs.pace,
          finishing: passer.attrs.finishing,
          longShots: passer.attrs.longShots,
          shotPower: passer.attrs.shotPower,
          composure: passer.attrs.composure,
        },
      });
    }
    const attackDir = passer.attackSign;
    const goalX = passer.oppGoalX();
    const distGoal = passer.distTo(goalX, 0);
    const progress = clamp((passer.x * attackDir + HALF_LENGTH) / (HALF_LENGTH * 2), 0, 1);
    const building = progress < 0.58 && this.pressure < 0.55;
    const wide = isWideAttacker(passer);
    // Space from decideAttack; only nudge run targets when already choosing RUN.
    if (decision.action === "RUN" && isStriker(passer) && distGoal < 44) {
      passer.runTargetX = passer.x + attackDir * 11;
      passer.runTargetZ = clamp(passer.z * 0.45, -10, 10);
      if (Math.abs(goalX - passer.x) < 22) {
        passer.runTargetX = goalX - attackDir * 2.2;
        passer.runTargetZ = clamp(passer.z * 0.3, -7, 7);
      }
    } else if (
      decision.action === "RUN" &&
      wide &&
      progress > 0.55 &&
      this.pressure < 0.42 &&
      decision.scores.runScore > decision.scores.passScore + 0.1
    ) {
      // Advance with the ball, cutting inside — never drive into the corner flag.
      passer.runTargetX = passer.x + attackDir * (6 + progress * 4);
      passer.runTargetZ = clamp(passer.z * 0.55, -12, 12);
      if (distGoal < 34) {
        passer.runTargetX = goalX - attackDir * 12;
        passer.runTargetZ = clamp(Math.sign(passer.z || 1) * 7.5, -11, 11);
      }
    } else if (passer.giveAndGoTimer > 0.2 && decision.action === "PASS") {
      passer.runTargetX = passer.x + attackDir * (8 + progress * 6);
      passer.runTargetZ = clamp(passer.z + (decision.space.dz || 0) * 0.4, -18, 18);
    } else {
      passer.runTargetX = decision.space.x;
      passer.runTargetZ = decision.space.z;
    }
    const oppGkEarly = this.opponentsOf(passer).find((p) => p.isGK);
    const inBoxEarly =
      inOpponentPenaltyArea(passer) || (distGoal < PENALTY_AREA_LENGTH + 1.5 && Math.abs(passer.z) < 20);
    const gkCloseEarly = !!oppGkEarly && passer.distTo(oppGkEarly.x, oppGkEarly.z) < 4.6;
    const boxDeadlineEarly = boxFinishDeadline(this.pressure, gkCloseEarly);
    // Closed-down in the box: stop lateral shuffle vs the keeper — plant / go goalward.
    if (inBoxEarly && (gkCloseEarly || this.possessionTime >= boxDeadlineEarly * 0.6)) {
      passer.runTargetX = passer.x + attackDir * (gkCloseEarly ? 1.2 : 2.4);
      passer.runTargetZ = clamp(passer.z * 0.35, -8, 8);
    }
    this.aiAct += dt;
    // Slower AI cadence in build-up so possession recirculates instead of forced shots.
    // Box finish window ticks faster so we don't wait a full AI beat while oscillating.
    const aiCadence = inBoxEarly && (gkCloseEarly || this.possessionTime >= boxDeadlineEarly) ? 0.1 : building ? 0.22 : 0.2;
    if (this.aiAct < aiCadence) return;
    this.aiAct = 0;
    let action = decision.action;
    let passTarget = decision.passTarget;
    // Progressive through only when it beats the carry and a runner is clearly ahead —
    // never a forced hoof through midfield after two seconds of possession.
    if (
      (action === "PASS" || action === "HOLD") &&
      this.possessionTime > 1.25 &&
      this.pressure > 0.22 &&
      decision.scores.throughBallScore >= 0.28 &&
      decision.scores.throughBallScore + 0.02 >= decision.scores.passScore &&
      decision.scores.throughBallScore >= decision.scores.runScore + 0.08
    ) {
      const thru = choosePassTarget(
        passer,
        this.teamOf(passer).players,
        this.opponentsOf(passer),
        this.ball,
        goalX - passer.x,
        0,
        "through",
        {
          forbidIds: this.passForbidIds(passer),
          style: building ? "buildup" : "attack",
          playStyle: (passer.side === "home" ? this.homePlayStyle : this.awayPlayStyle) ?? undefined,
        },
      );
      if (thru && (thru.x - passer.x) * attackDir > 6 && Math.abs(thru.z - passer.z) < 14) {
        action = "THROUGH";
        passTarget = thru;
      }
    }
    // Thin safety gates only — scoring (incl. clear chances) lives in decideAttack.
    const passLike = action === "PASS" || action === "THROUGH" || action === "LONG_PASS" || action === "CROSS";
    const forbid = this.passForbidIds(passer);
    if (passLike && !passTarget) action = "RUN";
    if (passLike && passTarget?.isGK) {
      passTarget = null;
      action = "RUN";
    }
    if (passLike && passTarget && forbid.includes(passTarget.id)) {
      // Find another free man instead of freezing on HOLD.
      const alt = choosePassTarget(
        passer,
        this.teamOf(passer).players,
        this.opponentsOf(passer),
        this.ball,
        0,
        0,
        "short",
        { forbidIds: forbid, style: building ? "buildup" : "attack" },
      );
      if (alt) {
        action = "PASS";
        passTarget = alt;
      } else {
        action = decision.scores.runScore >= 0.12 ? "RUN" : "HOLD";
      }
    }
    const stallStyle = (passer.side === "home" ? this.homePlayStyle : this.awayPlayStyle) ?? undefined;
    void oppGkEarly;
    const inBox = inBoxEarly;
    const gkClose = gkCloseEarly;
    const boxDeadline = boxDeadlineEarly;
    const boxMustFinish = inBox && this.possessionTime >= boxDeadline;
    // First-touch plant — AI must settle before kicking (PES second-touch timing).
    // Past the box deadline, never demote a finish back into the shuffle.
    if (
      passer.firstTouchTimer > 0.1 &&
      (passLike || action === "SHOT" || action === "LONG_SHOT") &&
      !boxMustFinish
    ) {
      action = decision.scores.runScore >= 0.08 ? "RUN" : "HOLD";
    }
    // Receive dwell — longer when there is grass to attack; shorter under pressure.
    {
      const composure = stat01(passer.attrs.composure);
      const vision = stat01(passer.attrs.vision);
      const patience = stallStyle?.receivePatience ?? 0.45;
      const openGrass = this.pressure < 0.34 && decision.space.score > 1.3 && decision.space.kind !== "back";
      const dwell = openGrass
        ? clamp(1.85 + (1 - composure) * 0.3 + stat01(passer.attrs.pace) * 0.25 + patience * 0.4, 1.55, 2.65)
        : this.pressure > 0.55
          ? clamp(0.85 + (1 - composure) * 0.22 - patience * 0.02, 0.65, 1.2)
          : clamp(1.25 + (1 - composure) * 0.28 + (1 - vision) * 0.1 + patience * 0.28, 1.05, 2.05);
      if (passLike && this.possessionTime < dwell && !boxMustFinish) action = "RUN";
    }
    // Marker on the ball + a cut lane = carry / shield, not a hopeful pass straight into him.
    if (
      passLike &&
      passTarget &&
      action !== "LONG_PASS" &&
      action !== "CROSS" &&
      this.possessionTime < 3.0 &&
      !boxMustFinish
    ) {
      const opps = this.opponentsOf(passer);
      const marked = opps.some((o) => !o.isGK && o.distTo(this.ball.x, this.ball.z) < 1.7);
      if (marked && passingLaneQuality(passer, passTarget.x, passTarget.z, opps) < 0.62) {
        action = decision.scores.runScore >= 0.1 ? "RUN" : "HOLD";
      }
    }
    // Stall breaker: give think time; only force a pass into a clear lane.
    const stallAt =
      (stallStyle?.id === "possession" ? 4.2 : stallStyle?.id === "routeOne" || stallStyle?.id === "direct" ? 3.1 : 3.6) /
      Math.max(0.85, stallStyle?.tempo ?? 1);
    // Box: force an end-product before the keeper-mirroring carry deadlock.
    if ((action === "RUN" || action === "HOLD") && boxMustFinish) {
      const cutbackOpen =
        !!passTarget &&
        !forbid.includes(passTarget.id) &&
        !passTarget.isGK &&
        passingLaneQuality(passer, passTarget.x, passTarget.z, this.opponentsOf(passer)) >= 0.55 &&
        !gkClose;
      // Keeper in the face → shoot; only pass when a clear cutback exists.
      if (gkClose || decision.scores.shotScore + 0.02 >= decision.scores.passScore || !cutbackOpen) {
        action = "SHOT";
      } else {
        action = "PASS";
      }
      passer.runTargetX = passer.x + attackDir * 1.2;
      passer.runTargetZ = clamp(passer.z * 0.3, -7, 7);
    }
    if ((action === "RUN" || action === "HOLD") && this.possessionTime >= stallAt) {
      const style = stallStyle;
      if (passTarget && !forbid.includes(passTarget.id) && !passTarget.isGK) {
        const lane = passingLaneQuality(passer, passTarget.x, passTarget.z, this.opponentsOf(passer));
        const need = style?.id === "possession" ? 0.5 : 0.45;
        if (lane >= need) action = "PASS";
        else if (style?.id === "possession") action = "HOLD";
      } else {
        const softForbid = forbid.slice(-2);
        const direct = style?.id === "direct" || style?.id === "routeOne";
        const counterBurst = style?.id === "counter" && this.possessionChangeAge < 3.2;
        const alt =
          choosePassTarget(
            passer,
            this.teamOf(passer).players,
            this.opponentsOf(passer),
            this.ball,
            direct || counterBurst ? attackDir * 20 : 0,
            0,
            direct || counterBurst ? "through" : "short",
            { forbidIds: softForbid, style: building ? "buildup" : "attack", playStyle: style },
          ) ??
          choosePassTarget(
            passer,
            this.teamOf(passer).players,
            this.opponentsOf(passer),
            this.ball,
            0,
            0,
            "short",
            { forbidIds: softForbid, style: building ? "buildup" : "attack", playStyle: style },
          );
        if (alt && passingLaneQuality(passer, alt.x, alt.z, this.opponentsOf(passer)) >= 0.42) {
          action = direct && (alt.x - passer.x) * attackDir > 6 ? "THROUGH" : "PASS";
          passTarget = alt;
        } else if (inBox) {
          action = "SHOT";
        }
      }
    }
    this.lastDecision = { ...decision, action, passTarget };
    const gk = this.opponentsOf(passer).find((p) => p.isGK);
    const aiAim = aiShotAimIntent({
      shooterX: passer.x,
      shooterZ: passer.z,
      goalX,
      gkZ: gk?.z,
      longShot: action === "LONG_SHOT",
      powerBias: action === "LONG_SHOT" ? 0.9 : 0.5,
      facing: passer.facing,
    });
    const fakeBase = {
      moveX: decision.space.dx,
      moveZ: decision.space.dz,
      aimX: action === "SHOT" || action === "LONG_SHOT" ? aiAim.aimX : decision.space.dx,
      aimY: action === "SHOT" || action === "LONG_SHOT" ? aiAim.aimY : 0.2,
      passHold: 0.32,
      pass: true,
      shootHold: 0,
    } as InputIntent;
    this.shootCharge = 0;
    if (action === "RUN" || action === "HOLD") return;
    if (action === "SHOT" || action === "LONG_SHOT") {
      // Pre-turn hips toward goal before the strike window.
      const goalDir = normalize2(goalX - passer.x, (gk?.z ?? 0) * 0.15 - passer.z * 0.05);
      turnFacingToward(passer, goalDir.x, goalDir.z, dt, { turnMul: 1.85 });
      // Back-to-goal finishes: refuse hopeful long shots; close range still mishits.
      if (
        bodyAlignment(passer.facing, goalX - passer.x, 0) < facingKickFloor("shot") &&
        action === "LONG_SHOT"
      ) {
        action = decision.scores.runScore >= 0.1 ? "RUN" : "HOLD";
        return;
      }
      // Settled enough to shoot — box can fire earlier; long shots need a short plant.
      const minShotHold =
        action === "LONG_SHOT"
          ? 1.05
          : boxMustFinish
            ? 0.28
            : inBox
              ? gkClose
                ? 0.32
                : 0.42
              : isStriker(passer)
                ? 0.48
                : 0.72;
      if (this.possessionTime < minShotHold && !boxMustFinish) {
        if (passTarget && decision.scores.passScore >= 0.28) action = "PASS";
        else {
          action = decision.scores.runScore >= 0.1 ? "RUN" : "HOLD";
          return;
        }
      } else {
        fakeBase.shootHold = action === "LONG_SHOT" ? 1.05 : isStriker(passer) ? 0.85 : 0.7;
        this.executeShot(passer, fakeBase, action === "LONG_SHOT", false, aiAim.bodyAlignment);
        return;
      }
    }
    const passType: PassType =
      action === "THROUGH" ? "through" : action === "LONG_PASS" ? "long" : action === "CROSS" ? "cross" : "short";
    const passDist = passTarget
      ? passer.distTo(passTarget.x, passTarget.z)
      : passType === "long" || passType === "cross"
        ? 28
        : 14;
    fakeBase.passHold = idealPassHold01(passType, passDist, {
      pressure: this.pressure,
      composure: passer.attrs.composure,
      tempo: stallStyle?.tempo,
    });
    const dir = passTarget
      ? normalize2(passTarget.x - passer.x, passTarget.z - passer.z)
      : { x: decision.space.dx, z: decision.space.dz };
    // Pre-turn toward the pass; only refuse when still badly squared under low pressure.
    turnFacingToward(passer, dir.x, dir.z, dt, { turnMul: 1.9 });
    // Closed-down box finish: don't soft-refuse forever while still shuffling.
    if (
      bodyAlignment(passer.facing, dir.x, dir.z) < facingKickFloor("pass") &&
      this.pressure < 0.72 &&
      !(boxMustFinish && (gkClose || this.pressure > 0.5))
    ) {
      return;
    }
    this.executePass(passer, passTarget, fakeBase, passType, dir);
    if (passTarget && isBackwardPass(passer, passTarget.x, passTarget.z)) {
      passer.giveAndGoTimer = Math.max(passer.giveAndGoTimer, isStriker(passer) ? 2.45 : 2.1);
      passer.runTargetX = passer.x + attackDir * (isStriker(passer) ? 12.5 : 10);
      passer.runTargetZ = clamp(passer.z * 0.6 + passTarget.z * 0.2, -16, 16);
    } else if (
      passTarget &&
      isStriker(passer) &&
      passType === "short" &&
      Math.abs((passTarget.x - passer.x) * attackDir) < 5 &&
      passer.distTo(passTarget.x, passTarget.z) < 16
    ) {
      // Lateral / drop lay-off: control → release → make the run.
      passer.giveAndGoTimer = Math.max(passer.giveAndGoTimer, 2.35);
      passer.runTargetX = passer.x + attackDir * 11.5;
      passer.runTargetZ = clamp(passer.z * 0.55 + passTarget.z * 0.15, -14, 14);
    }
  }

  private thinkKickOff(kicker: Player, dt: number): void {
    kicker.runTargetX = kicker.x;
    kicker.runTargetZ = kicker.z;
    kicker.vx = 0;
    kicker.vz = 0;
    if (this.possessionTime < KICK_OFF_PASS_DELAY) {
      void dt;
      return;
    }
    const target = chooseKickOffReceiver(kicker, this.teamOf(kicker).players);
    const dir = target
      ? normalize2(target.x - kicker.x, target.z - kicker.z)
      : { x: -kicker.attackSign, z: 0 };
    kicker.facing = Math.atan2(dir.x, dir.z);
    const dist = target ? kicker.distTo(target.x, target.z) : 12;
    // Weight the ritual pass for distance — the old fixed 0.28 hold underhit 8–16 m taps.
    const passHold = Math.min(
      1,
      idealPassHold01("short", dist, { composure: kicker.attrs.composure ?? 70, tempo: 1 }) + 0.08,
    );
    const fake = { moveX: dir.x, moveZ: dir.z, aimX: dir.x, aimY: 0, passHold, pass: true, shootHold: 0 } as InputIntent;
    this.executePass(kicker, target, fake, "short", dir);
  }

  /** User-controlled release from the hands: roll / throw / kick / punt. */
  private handleUserKeeperRelease(gk: Player, intent: InputIntent): void {
    this.faceKeeperToPlay(gk);
    const dir = this.aimDir(intent, gk);
    const wantPunt = intent.shoot || intent.passHold > 0.9 || intent.through;
    if (wantPunt) {
      const aimX = gk.x + gk.attackSign * (48 + intent.passHold * 12);
      const aimZ = clamp((dir.z || 0) * 22, -22, 22);
      // passKickVector already lands near the aim — the old /1.65 cap truncated deep punts.
      const kick = passKickVector(this.ball.x, this.ball.z, aimX, aimZ, "long");
      this.ball.y = 0.28;
      kickBall(this.ball, kick.vx * 1.04, kick.vz * 1.04, Math.max(kick.vy * 1.06, 7.0));
      this.clearOwner();
      gk.handRelease = false;
      gk.kickTimer = 0.95;
      this.ball.lastTouchId = gk.id;
      this.ball.lastTouchSide = gk.side;
      this.ballState = "loose";
      this.incomingAerial = true;
      this.longPassLanding = { x: aimX, z: aimZ };
      this.stats.longPasses += 1;
      this.pendingPassFrom = gk.id;
      return;
    }
    const target = choosePassTarget(
      gk,
      this.teamOf(gk).players,
      this.opponentsOf(gk),
      this.ball,
      dir.x || gk.attackSign,
      dir.z,
      intent.cross ? "long" : "short",
      { forbidIds: this.passForbidIds(gk), style: "buildup" },
    );
    if (!target) return;
    const dist = gk.distTo(target.x, target.z);
    const delivery = keeperPassDelivery(dist, this.pressure);
    gk.facing = Math.atan2(target.x - gk.x, target.z - gk.z);
    if (delivery === "roll" || delivery === "throw") {
      this.executeKeeperHandRelease(gk, target, delivery);
      return;
    }
    const passType: PassType = dist > 18 ? "long" : "short";
    const passHold = idealPassHold01(passType, dist, {
      composure: gk.attrs.composure ?? 70,
      pressure: this.pressure,
      tempo: 1,
    });
    const fake = {
      moveX: dir.x,
      moveZ: dir.z,
      aimX: dir.x,
      aimY: 0,
      passHold,
      pass: true,
      shootHold: 0,
    } as InputIntent;
    this.executePass(gk, target, fake, passType, normalize2(target.x - gk.x, target.z - gk.z));
    gk.handRelease = false;
    gk.kickTimer = 0.95;
  }

  private thinkKeeperDistribution(gk: Player, dt: number): void {
    gk.vx = 0;
    gk.vz = 0;
    gk.runTargetX = gk.x;
    gk.runTargetZ = gk.z;
    this.faceKeeperToPlay(gk);
    const decided = decideKeeperDistribution({
      gk,
      teammates: this.teamOf(gk).players,
      opponents: this.opponentsOf(gk),
      possessionTime: this.possessionTime,
      pressure: this.pressure,
      skipIds: this.passForbidIds(gk),
    });
    if (decided.action === "wait") return;
    if (decided.action === "pass") {
      const dir = normalize2(decided.target.x - gk.x, decided.target.z - gk.z);
      gk.facing = Math.atan2(dir.x, dir.z);
      const dist = gk.distTo(decided.target.x, decided.target.z);
      if (decided.delivery === "roll" || decided.delivery === "throw") {
        this.executeKeeperHandRelease(gk, decided.target, decided.delivery);
        return;
      }
      const passType: PassType = dist > 18 ? "long" : "short";
      const passHold = idealPassHold01(passType, dist, {
        composure: gk.attrs.composure ?? 70,
        pressure: this.pressure,
        tempo: 1,
      });
      const fake = {
        moveX: dir.x,
        moveZ: dir.z,
        aimX: dir.x,
        aimY: 0,
        passHold,
        pass: true,
        shootHold: 0,
      } as InputIntent;
      this.executePass(gk, decided.target, fake, passType, dir);
      gk.handRelease = false;
      gk.kickTimer = 0.95;
      return;
    }
    const dx = decided.x - this.ball.x;
    const dz = decided.z - this.ball.z;
    gk.facing = Math.atan2(dx, dz);
    // Drop from the hands then clear — use the long-pass solver so deep punts actually travel.
    const kick = passKickVector(this.ball.x, this.ball.z, decided.x, decided.z, "long");
    this.ball.y = 0.28;
    kickBall(this.ball, kick.vx * 1.04, kick.vz * 1.04, Math.max(kick.vy * 1.06, 7.0));
    this.clearOwner();
    gk.handRelease = false;
    gk.kickTimer = 0.95;
    this.ball.lastTouchId = gk.id;
    this.ball.lastTouchSide = gk.side;
    this.ballState = "loose";
    this.incomingAerial = true;
    this.longPassLanding = { x: decided.x, z: decided.z };
    this.stats.longPasses += 1;
    this.pendingPassFrom = gk.id;
    void dt;
  }

  /** Roll or throw from the hands after a claim. */
  private executeKeeperHandRelease(gk: Player, target: Player, delivery: "throw" | "roll"): void {
    const aim = keeperOutletAimPoint(target);
    const kicking = stat01(gk.attrs.gkKicking ?? gk.attrs.passing);
    const impulse = keeperHandReleaseVector(
      this.ball.x,
      this.ball.z,
      aim.x,
      aim.z,
      delivery,
      kicking,
    );
    if (this.ball.y < 0.25) this.ball.y = 0.28;
    kickBall(this.ball, impulse.vx, impulse.vz, impulse.vy);
    this.incomingAerial = delivery === "throw" && impulse.vy > 2.6;
    this.clearOwner();
    gk.handRelease = true;
    gk.kickTimer = 0.72;
    this.ball.lastTouchId = gk.id;
    this.ball.lastTouchSide = gk.side;
    this.ballState = "loose";
    this.passTargetId = target.id;
    this.longPassLanding = { x: aim.x, z: aim.z };
    this.pendingPassFrom = gk.id;
    this.assistCandidate = gk.id;
    this.stats.passes += 1;
  }

  /** Face upfield into open play (respects flipped ends). */
  private faceKeeperToPlay(gk: Player): void {
    gk.facing = gk.attackSign > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  /**
   * User movement with jockey dual-use:
   * - off ball + light stick → contain (open-soccer stand-off)
   * - off ball + stick into the play → jockey/press shadow
   * - on ball → close-control (movePlayer / stepDribble)
   */
  private controlUserPlayer(
    player: Player,
    intent: InputIntent,
    dt: number,
    moveEx: ReturnType<Match["moveExtras"]>,
  ): void {
    if (intent.jockey && !player.hasBall && !player.isGK) {
      const goalX = player.ownGoalX();
      const stickLen = Math.hypot(intent.moveX, intent.moveZ);
      // Soft stick / hold = contain arc; commit stick toward ball = tighter jockey.
      const mark =
        stickLen < 0.28 && !intent.sprint
          ? containTarget(player, this.ball.x, this.ball.z, goalX)
          : jockeyTarget(player, this.ball.x, this.ball.z, goalX);
      const toMarkX = mark.x - player.x;
      const toMarkZ = mark.z - player.z;
      const markLen = Math.hypot(toMarkX, toMarkZ) || 1;
      const assist = stickLen > 0.12 ? 0.55 : 0.92;
      const mx = intent.moveX;
      const mz = intent.moveZ;
      intent.moveX = (toMarkX / markLen) * assist + mx * (1 - assist * 0.65);
      intent.moveZ = (toMarkZ / markLen) * assist + mz * (1 - assist * 0.65);
      controlPlayer(player, intent, dt, this.pressure, {
        ...moveEx,
        speedMul: (moveEx.speedMul ?? 1) * (stickLen < 0.28 ? 0.82 : 1),
      });
      intent.moveX = mx;
      intent.moveZ = mz;
      return;
    }
    controlPlayer(player, intent, dt, this.pressure, moveEx);
  }

  private moveExtras(extraHints?: import("./players/FacingControl").FacingHint[]) {
    const facingHints = [...(extraHints ?? [])];
    return {
      accelMul: this.tuning.movementAccelerationMultiplier,
      speedMul: this.tuning.maxSpeedMultiplier,
      turnMul: this.tuning.turnMultiplier,
      drainMul: this.tuning.staminaDrainMultiplier,
      matchDrainScale: staminaMatchDrainScale(this.clock.duration),
      grip: this.env.playerGripMultiplier,
      facingHints,
    };
  }

  /** Prefer the foot on the same side as the kick lateral relative to hips. */
  private preferRightKickFoot(player: Player, dirX: number, dirZ: number): boolean {
    const len = Math.hypot(dirX, dirZ) || 1;
    const fx = Math.sin(player.facing);
    const fz = Math.cos(player.facing);
    // Local +X (right) when facing +Z: (fz, -fx) wait — right = (cos, -sin) for yaw around Y with front +Z:
    const rightX = fz;
    const rightZ = -fx;
    return (dirX / len) * rightX + (dirZ / len) * rightZ >= 0;
  }

  private aimDir(intent: InputIntent, passer: Player): { x: number; z: number } {
    const attack = passer.attackSign;
    if (Math.hypot(intent.aimX, intent.aimY) > 0.16) {
      return normalize2(intent.aimX, intent.aimY);
    }
    if (Math.hypot(intent.moveX, intent.moveZ) > 0.12) {
      return normalize2(intent.moveX, intent.moveZ);
    }
    return { x: attack, z: 0 };
  }

  private executePass(passer: Player, target: Player | null, intent: InputIntent, passType: PassType, dir: { x: number; z: number }): void {
    const openingKick = this.state === FootballState.KICK_OFF;
    if (target?.isGK && !passer.isGK) target = null;
    const hold01 = clamp(holdPowerCurve(intent.passHold, 1.1), 0.12, 1);
    let delivery: PassType = passType;
    // Explicit chip, or through under heavy pressure → lofted chip over the closing man.
    {
      const press = computePressure(passer, this.opponentsOf(passer)).value;
      const human = !this.autoplay && passer.id === this.controlled.id;
      if (delivery === "chip") {
        /* already lofted */
      } else if (delivery === "through" && press > 0.62 && (hold01 > 0.55 || (!human && press > 0.72))) {
        delivery = "chip";
      }
    }
    let distance =
      target ? passer.distTo(target.x, target.z) : delivery === "long" || delivery === "cross" ? 28 : 14;
    // Distance-based long: ground "shorts" beyond ~22m should loft and count as long outlets.
    if (delivery === "short" && distance >= 22) delivery = "long";
    else if (delivery === "through" && distance >= 28) delivery = "long";
    const align = bodyAlignment(passer.facing, dir.x, dir.z);
    const touchScale = firstTouchKickScale(passer.firstTouchTimer);
    const result = computePassError({
      distance,
      pressure: computePressure(passer, this.opponentsOf(passer)).value,
      bodyAlignment: align * touchScale,
      energy: passer.energy.value,
      attrs: passer.attrs,
      passType: delivery,
      hold01,
    });
    result.angleError *= this.tuning.passErrorMultiplier / Math.max(0.55, touchScale);
    result.powerError *= this.tuning.passErrorMultiplier / Math.max(0.55, touchScale);
    // Keepers distributing to wide FBs: cut aim scatter so releases don't go for a throw-in.
    if (passer.isGK) result.angleError *= 0.32;
    // Hips-off forced pass: inflate weight error so it underhits or skids wide.
    if (align < facingKickFloor("pass")) {
      result.angleError *= 1.55;
      result.powerError = result.powerError * 1.4 - 1.8;
    }
    // Aim into the receiver's run (desired / velocity), not static feet + oversized empty lead.
    let destX = target
      ? target.x +
        (target.desiredX !== 0 ? (target.desiredX - target.x) * 0.35 : target.vx * 0.45) +
        target.vx * 0.25
      : passer.x + dir.x * distance;
    let destZ = target
      ? target.z +
        (target.desiredZ !== 0 ? (target.desiredZ - target.z) * 0.35 : target.vz * 0.45) +
        target.vz * 0.25
      : passer.z + dir.z * distance;
    if (passer.isGK && target) {
      const aim = keeperOutletAimPoint(target);
      destX = aim.x;
      destZ = aim.z;
    }
    if ((delivery === "through" || delivery === "chip") && target) {
      const space = throughBallAim(passer, target, this.opponentsOf(passer));
      destX = space.x;
      destZ = space.z;
    }
    const offset = rotate2(destX - passer.x, destZ - passer.z, result.angleError);
    destX = passer.x + offset.x;
    destZ = passer.z + offset.z;
    if (passer.isGK) destZ = clampInboundZ(destZ, TOUCHLINE_SAFE_MARGIN + 1);
    const aimed = Math.hypot(intent.moveX, intent.moveZ, intent.aimX, intent.aimY) > 0.22;
    const aiPass = this.autoplay || passer.id !== this.controlled.id || !aimed || !target;
    // Only force-remap untargeted long/cross dumps; short/through keep chosen teammates.
    const safe = safePassDestination(passer, destX, destZ, this.teamOf(passer).players, {
      forceForward: aiPass && !openingKick && (delivery === "long" || delivery === "cross") && !target,
      allowBackward: openingKick,
    });
    destX = safe.x;
    destZ = safe.z;
    if (!this.ballActor.tryClaim("kick", passer.id)) return;
    // Enter PLAYING only after the kick is claimed — never abandon a silent kick-off.
    if (openingKick) this.state = FootballState.PLAYING;
    const kick = passKickVector(this.ball.x, this.ball.z, destX, destZ, delivery);
    const strengthScale = strengthKickScale(passer.attrs.strength);
    // Kick is already calibrated to stepBall — only apply small error/strength, not mode speed mul
    // (mode mul was undershooting catchable arrivals after the solver).
    const execScale = clamp(1 + result.powerError / 22, 0.9, 1.1) * clamp(strengthScale, 0.92, 1.08);
    const modeNudge = clamp(this.tuning.passSpeedMultiplier, 0.92, 1.08);
    if (this.ball.y < 0.25) this.ball.y = 0.28;
    const loftVy = kick.vy * execScale;
    kickBall(this.ball, kick.vx * execScale * modeNudge, kick.vz * execScale * modeNudge, loftVy);
    this.stats.passApexSamples.push(BALL_RADIUS + (loftVy * loftVy) / (2 * BALL_GRAVITY));
    if (this.stats.passApexSamples.length > 800) {
      this.stats.passApexSamples.splice(0, this.stats.passApexSamples.length - 800);
    }
    this.clearOwner();
    // Plant after kick — can't remagnet / second-kick instantly.
    passer.kickSwingRight = this.preferRightKickFoot(passer, kick.vx, kick.vz);
    passer.kickTimer = 0.48;
    passer.firstTouchTimer = Math.max(passer.firstTouchTimer, 0.12);
    // Release window: the ball is leaving the boot, so a marker standing on the passer cannot
    // vacuum it up in the very first frames (a lane-block still happens once it travels on).
    for (const o of this.opponentsOf(passer)) {
      if (!o.isGK && o.distTo(this.ball.x, this.ball.z) < 2.0) o.kickTimer = Math.max(o.kickTimer, 0.26);
    }
    this.assistCandidate = passer.id;
    this.ball.lastTouchId = passer.id;
    this.ball.lastTouchSide = passer.side;
    this.ballState = "loose";
    {
      const kickDir = normalize2(kick.vx, kick.vz);
      const human = !this.autoplay && passer.id === this.controlled.id;
      const lofted = delivery === "long" || delivery === "cross" || delivery === "chip";
      // Routine ground passes: no AI banana — curve was missing the 1.45 m collect radius.
      this.aftertouch = openAftertouch({
        kind: "pass",
        dirX: kickDir.x,
        dirZ: kickDir.z,
        technique: passer.attrs.passing * 0.5 + passer.attrs.composure * 0.3 + (passer.attrs.crossing ?? passer.attrs.longPassing) * 0.2,
        strengthMul: this.tuning.aftertouchMultiplier * (human ? 1 : lofted ? 0.32 : 0.05),
        aiSide: human || !lofted ? null : aiCurveSide(destZ, this.ball.z, { dirX: kickDir.x, dirZ: kickDir.z }),
      });
    }
    this.stats.passes += 1;
    if (delivery === "short") this.stats.shortPasses += 1;
    if (delivery === "long") this.stats.longPasses += 1;
    if (delivery === "through" || delivery === "chip") this.stats.throughBalls += 1;
    if (delivery === "cross") this.stats.crosses += 1;
    {
      const width = Math.abs(destZ - passer.z);
      const ahead = (destX - passer.x) * passer.attackSign;
      const dist = Math.hypot(destX - passer.x, destZ - passer.z);
      this.stats.passDistanceSum += dist;
      if (ahead >= 10) {
        this.stats.progressivePasses += 1;
        this.stats.progressivePassDistance += ahead;
      }
      if (delivery !== "cross" && width > 16 && ahead < 10) this.stats.crossFieldPasses += 1;
    }
    if (delivery === "long" || delivery === "cross" || delivery === "chip") this.incomingAerial = true;
    this.pendingPassFrom = passer.id;
    this.lastPassFrom = passer.id;
    this.recentPassIds.push(passer.id);
    if (target) this.recentPassIds.push(target.id);
    // Keep forbid short so build-up can recirculate without starving all outlets.
    if (this.recentPassIds.length > 3) this.recentPassIds.splice(0, this.recentPassIds.length - 3);
    const returnDist = target ? passer.distTo(target.x, target.z) : 99;
    // Avoid one-two loops between two close players — only invite a return if they spread.
    passer.giveAndGoTimer = returnDist >= 10 ? 1.55 : 0.35;
    this.longPassLanding = { x: destX, z: destZ };
    this.passVector = normalize2(kick.vx, kick.vz);
    this.passTargetId = target?.id ?? null;
    if (openingKick) {
      this.clearOffsidePhase();
    } else {
      const flagged = playersOffsideAtPass(passer, this.teamOf(passer).players, this.opponentsOf(passer), passer.x);
      this.offsidePassIds = new Set(flagged);
      // Keep passTargetId even when the target is offside — they must chase/interfere to award the flag.
    }
    if (
      target &&
      target.side === this.userSide &&
      (delivery === "long" || delivery === "through" || delivery === "chip") &&
      !this.offsidePassIds.has(target.id)
    ) {
      this.controlled = target;
    }
  }

  private executeShot(
    passer: Player,
    intent: InputIntent,
    longShot = false,
    overcharged = false,
    alignmentHint = 0.75,
  ): void {
    const hold01 = clamp(intent.shootHold / 1.15, 0.15, 1);
    if (overcharged && (this.pressure > 0.28 || Math.random() < 0.42)) {
      this.makeLoose(passer);
      this.ball.vx += (Math.random() - 0.5) * 6;
      this.ball.vz += (Math.random() - 0.5) * 6;
      this.ball.vy = 0.4;
      passer.kickTimer = 0.28;
      this.shootCharge = 0;
      this.shotTarget = null;
      this.events.emit("SHOT", { playerId: passer.id, power: 0 });
      return;
    }
    const goalX = passer.oppGoalX();
    const aim = aimOnGoal(intent.aimX, intent.aimY, this.invertShotY);
    const distGoal = passer.distTo(goalX, 0);
    const isHeader = this.ball.y > 1.45 || this.incomingAerial;
    // Real hips vs goal — human and AI both gated by facing, not a flat 0.75.
    const hips = bodyAlignment(passer.facing, goalX - passer.x, aim.x - passer.z);
    const touchScale = firstTouchKickScale(passer.firstTouchTimer);
    const alignment = clamp(Math.min(hips, alignmentHint) * touchScale, 0.12, 1);
    const result = computeShot({
      distance: distGoal,
      pressure: this.pressure,
      bodyAlignment: alignment,
      energy: passer.energy.value,
      attrs: passer.attrs,
      hold01,
      isHeader,
      shotKind: longShot || hold01 > 0.85 ? "long" : distGoal < 12 ? "close" : hold01 > 0.7 ? "power" : "normal",
      overcharged,
    });
    result.dx *= this.tuning.shotErrorMultiplier / Math.max(0.55, touchScale);
    result.dy *= this.tuning.shotErrorMultiplier / Math.max(0.55, touchScale);
    if (alignment < facingKickFloor("shot")) {
      result.dx *= 1.45;
      result.dy += 0.55;
      result.power *= 0.82;
    }
    const targetZ = aim.x + result.dx;
    const targetY = aim.y + result.dy;
    const dx = goalX - this.ball.x;
    const dz = targetZ - this.ball.z;
    const dist = Math.hypot(dx, dz) || 1;
    const power =
      result.power *
      this.tuning.shotPowerMultiplier *
      (passer.boosting ? SPEED_BURST_SHOT_MUL : 1) *
      (isStriker(passer) ? 1.06 : 1);
    // Ballistic loft: reach aim height near the goal plane (vy ≈ h/T + 0.5 g T).
    const flightT = clamp(dist / Math.max(12, power * 0.72), 0.45, longShot ? 1.55 : 1.15);
    const aimH = clamp(targetY, 0.35, 2.35);
    let lift = isHeader
      ? clamp(aimH / flightT + 0.5 * BALL_GRAVITY * flightT * 0.55, 1.6, 6.5)
      : clamp(aimH / flightT + 0.5 * BALL_GRAVITY * flightT * (longShot ? 0.72 : 0.62), longShot ? 4.2 : 3.2, longShot ? 11 : 8.5);
    if (isStriker(passer) && !longShot && !isHeader) lift = Math.max(lift, 3.6);
    const pack = nearbyDefenders(passer, this.opponentsOf(passer));
    this.clearOwner();
    this.clearOffsidePhase();
    passer.kickSwingRight = this.preferRightKickFoot(passer, dx, dz);
    passer.kickTimer = 0.36;
    passer.firstTouchTimer = Math.max(passer.firstTouchTimer, 0.1);
    this.shotTarget = null;
    this.stats.shots += 1;
    if (longShot) this.stats.longShots += 1;
    this.events.emit("SHOT", { playerId: passer.id, power });
    this.shootCharge = 0;
    this.stadium.crowd.setReaction("HOME", "cheer", 0.38);
    this.stadium.crowd.setReaction("AWAY", "cheer", 0.32);
    this.ball.lastTouchId = passer.id;
    this.ball.lastTouchSide = passer.side;
    // Keep prior passer as assist candidate; cleared on turnover / new pass.
    if (this.assistCandidate === passer.id) this.assistCandidate = null;
    if (pack.length && Math.random() < crowdRicochetChance(pack.length, this.pressure, power)) {
      pack.sort((a, b) => a.distTo(passer.x, passer.z) - b.distTo(passer.x, passer.z));
      kickBall(this.ball, (dx / dist) * power, (dz / dist) * power, lift);
      ricochetOffDefender(this.ball, pack[0], passer.side, { power });
      this.incomingShot = false;
      this.ball.lastTouchId = pack[0].id;
      this.ball.lastTouchSide = pack[0].side;
      return;
    }
    kickBall(this.ball, (dx / dist) * power, (dz / dist) * power, lift);
    this.incomingShot = true;
    // Gate aerial from real loft — flat lasers with lift~1–3 must not use header/air collect.
    const apexApprox = BALL_RADIUS + (lift * lift) / (2 * BALL_GRAVITY);
    this.stats.shotApexSamples.push(apexApprox);
    if (this.stats.shotApexSamples.length > 200) {
      this.stats.shotApexSamples.splice(0, this.stats.shotApexSamples.length - 200);
    }
    this.incomingAerial = longShot || isHeader || apexApprox >= 1.55;
    {
      const human = !this.autoplay && passer.id === this.controlled.id;
      const tech =
        passer.attrs.finishing * 0.35 +
        passer.attrs.shooting * 0.35 +
        passer.attrs.composure * 0.3;
      this.aftertouch = openAftertouch({
        kind: "shot",
        dirX: dx / dist,
        dirZ: dz / dist,
        technique: tech,
        strengthMul:
          this.tuning.aftertouchMultiplier *
          (human ? 1 : aiAftertouchStrengthMul(distGoal)),
        aiSide: human ? null : aiCurveSide(targetZ, this.ball.z),
      });
    }
  }

  private handleTackles(intent: InputIntent): void {
    if (intent.tackle) this.beginSlideChallenge(this.controlled, true);
  }

  private maybeAiTackle(): void {
    // Carrier challenge — defending presser only, preferably a defensive role.
    if (this.possessing && this.pressingId) {
      const presser = this.playerById(this.pressingId);
      if (presser && presser.side !== this.possessing.side && !presser.isGK) {
        const through = isThroughOnGoal(this.possessing, presser);
        const defensiveRole = isDefensiveSlideRole(presser);
        if (defensiveRole || through) {
          const decision = shouldAiSlideTackle({
            distance: presser.distTo(this.possessing.x, this.possessing.z) / this.tuning.tackleWindowMultiplier,
            ballDistance: presser.distTo(this.ball.x, this.ball.z),
            pressure: this.pressure,
            possessionTime: this.possessionTime,
            cooldown: presser.tackleCooldown,
            recoverTimer: presser.slideRecoverTimer,
            energy: presser.energy.value,
            fromBehind: approachFromBehind(presser, this.possessing),
            throughOnGoal: through,
            ballLoose: false,
            tackling: tacklingStat(presser),
            aggression: presser.attrs.aggression ?? presser.attrs.defending,
            defensiveRole,
            defending: true,
          });
          if (decision.attempt) this.beginSlideChallenge(presser, false);
        }
      }
    }

    // Loose ball: only defending-side defenders cutting out an opponent pass — never attacking retrieves.
    if (!this.possessing) {
      const speed = Math.hypot(this.ball.vx, this.ball.vz);
      if (speed < 5.5) return;
      const lastSide = this.ball.lastTouchSide;
      if (!lastSide) return;
      const defendingSide: "home" | "away" = lastSide === "home" ? "away" : "home";
      // User-controlled side in a live match still chooses their own slides.
      if (!this.autoplay && defendingSide === this.userSide) return;
      const team = defendingSide === "home" ? this.home : this.away;
      let best: Player | null = null;
      let bestD = Infinity;
      for (const p of team.players) {
        if (p.sentOff || p.isGK || p.sliding || p.slideRecoverTimer > 0 || p.tackleCooldown > 0) continue;
        if (!isDefensiveSlideRole(p)) continue;
        const d = p.distTo(this.ball.x, this.ball.z);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (!best) return;
      const decision = shouldAiSlideTackle({
        distance: bestD,
        ballDistance: bestD,
        pressure: 0.35,
        possessionTime: 1,
        cooldown: best.tackleCooldown,
        recoverTimer: best.slideRecoverTimer,
        energy: best.energy.value,
        fromBehind: 0,
        throughOnGoal: false,
        ballLoose: true,
        tackling: tacklingStat(best),
        aggression: best.attrs.aggression ?? best.attrs.defending,
        defensiveRole: true,
        defending: true,
        opponentPassInFlight: true,
      });
      if (decision.attempt) this.beginSlideChallenge(best, false);
    }
  }

  /** User / AI commits to a slide toward the ball (and carrier if present). */
  private beginSlideChallenge(defender: Player, timed: boolean): void {
    if (defender.isGK || defender.sentOff || defender.sliding) return;
    if (defender.tackleCooldown > 0 || defender.slideRecoverTimer > 0) return;
    if (defender.energy.value < SLIDE_MIN_ENERGY) return;
    if (this.possessing && this.possessing.side === defender.side) return;

    const target =
      this.possessing && this.possessing.side !== defender.side
        ? { x: this.ball.x * 0.65 + this.possessing.x * 0.35, z: this.ball.z * 0.65 + this.possessing.z * 0.35 }
        : { x: this.ball.x, z: this.ball.z };
    const dist = defender.distTo(target.x, target.z);
    if (dist > SLIDE_COMMIT_RANGE + 1.2) {
      // Way too early — short stumble, long recovery.
      defender.tackleCooldown = TACKLE_COOLDOWN * 0.7;
      defender.slideRecoverMax = SLIDE_RECOVER_EARLY * 0.55;
      defender.slideRecoverTimer = defender.slideRecoverMax;
      defender.energy.spend(SLIDE_STAMINA_COST * 0.45);
      defender.vx *= 0.35;
      defender.vz *= 0.35;
      return;
    }

    const aim = slideAimDir(defender, target);
    defender.sliding = true;
    defender.slideDuration = SLIDE_DURATION * (0.88 + stat01(tacklingStat(defender)) * 0.22);
    defender.slideTimer = defender.slideDuration;
    defender.slideDirX = aim.x;
    defender.slideDirZ = aim.z;
    defender.facing = Math.atan2(aim.x, aim.z);
    defender.tackleCooldown = TACKLE_COOLDOWN;
    defender.energy.spend(SLIDE_STAMINA_COST);
    defender.vx = aim.x * SLIDE_SPEED;
    defender.vz = aim.z * SLIDE_SPEED;
    this.stats.tackles += 1;
    this.currentTacklerId = defender.id;
    // Stash whether this was a timed (user) challenge on the player via kickTimer abuse? Use firstTouchTimer no.
    // Use giveAndGoTimer as a tiny flag? Better: store on Match map.
    this.slideTimed.set(defender.id, timed);
    if (dist > SLIDE_COMMIT_RANGE * 0.72) {
      // Early commit — shorter contact window / flagged for longer recover on miss.
      defender.slideTimer *= 0.85;
      defender.slideDuration = defender.slideTimer;
    }
  }

  private updateSlides(dt: number): void {
    for (const p of [...this.home.players, ...this.away.players]) {
      if (p.sentOff) continue;
      if (!p.sliding) {
        if (p.slideRecoverTimer > 0) {
          // Recovery also ticks inside movePlayer when AI/user try to move; still tick here if skipped.
          p.slideRecoverTimer = Math.max(0, p.slideRecoverTimer - dt);
          p.vx *= Math.pow(0.08, dt);
          p.vz *= Math.pow(0.08, dt);
        }
        continue;
      }

      p.slideTimer -= dt;
      const speed = SLIDE_SPEED * (0.92 + (p.attrs.jumping ?? 70) / 500);
      p.vx = p.slideDirX * speed;
      p.vz = p.slideDirZ * speed;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.x = clamp(p.x, -HALF_LENGTH - 1.1, HALF_LENGTH + 1.1);
      p.z = clamp(p.z, -HALF_WIDTH - 1.1, HALF_WIDTH + 1.1);
      p.sprinting = false;
      p.boosting = false;

      const timed = this.slideTimed.get(p.id) ?? false;
      let resolved: TackleOutcome | null = null;

      if (this.possessing && this.possessing.side !== p.side) {
        const holder = this.possessing;
        const nearBody = p.distTo(holder.x, holder.z) <= SLIDE_CONTACT;
        const nearBall = p.distTo(this.ball.x, this.ball.z) <= SLIDE_CONTACT + 0.15;
        if (nearBody || nearBall) {
          const ctx = buildTackleContext(p, holder, this.ball, this.pressure, timed);
          resolved = resolveTackle(ctx);
          this.applySlideOutcome(p, holder, resolved);
        }
      } else if (!this.possessing && p.distTo(this.ball.x, this.ball.z) <= SLIDE_CONTACT + 0.2) {
        resolved = resolveLooseBallSlide(p, this.ball, timed);
        this.applySlideOutcome(p, null, resolved);
      }

      if (resolved) {
        this.endSlide(p, resolved === "MISS" || resolved === "RETAIN");
        continue;
      }

      if (p.slideTimer <= 0) {
        // Missed — too early or mistimed.
        const early = p.distTo(this.ball.x, this.ball.z) > SLIDE_CONTACT + 0.8;
        const recover = early ? SLIDE_RECOVER_EARLY : SLIDE_RECOVER_MISS;
        p.slideRecoverMax = recover;
        p.slideRecoverTimer = recover;
        this.endSlide(p, true);
      }
    }
  }

  private endSlide(defender: Player, failed: boolean): void {
    defender.sliding = false;
    defender.slideTimer = 0;
    this.slideTimed.delete(defender.id);
    if (failed) {
      defender.vx *= 0.25;
      defender.vz *= 0.25;
      if (defender.slideRecoverTimer <= 0) {
        defender.slideRecoverMax = SLIDE_RECOVER_MISS;
        defender.slideRecoverTimer = SLIDE_RECOVER_MISS;
      } else if (defender.slideRecoverMax <= 0) {
        defender.slideRecoverMax = defender.slideRecoverTimer;
      }
    } else {
      defender.vx *= 0.55;
      defender.vz *= 0.55;
      // Successful win — short get-up, not a long prone.
      if (defender.slideRecoverTimer <= 0) {
        defender.slideRecoverMax = 0.42;
        defender.slideRecoverTimer = 0.42;
      }
    }
  }

  private applySlideOutcome(defender: Player, holder: Player | null, outcome: TackleOutcome): void {
    if (outcome === "CLEAN_WIN") {
      this.stats.successfulTackles += 1;
      this.stats.turnovers += 1;
      if (holder) this.makeLoose(holder);
      this.takePossession(defender);
      this.ball.vx = defender.vx * 0.35;
      this.ball.vz = defender.vz * 0.35;
      this.toast("TACKLE");
      return;
    }
    if (outcome === "KNOCKED_LOOSE") {
      this.stats.successfulTackles += 1;
      this.stats.turnovers += 1;
      if (holder) this.makeLoose(holder);
      else this.clearOwner();
      const side = Math.random() < 0.5 ? 1 : -1;
      this.ball.vx = defender.slideDirX * (3 + Math.random() * 4) + (Math.random() - 0.5) * 3;
      this.ball.vz = defender.slideDirZ * (2 + Math.random() * 3) + side * (1 + Math.random() * 3);
      this.ball.vy = 0.55 + Math.random() * 0.5;
      if (holder) {
        holder.vx += defender.slideDirX * 2.2;
        holder.vz += defender.slideDirZ * 2.2;
        holder.slideRecoverTimer = Math.max(holder.slideRecoverTimer, 0.55);
      }
      this.toast("TACKLE");
      return;
    }
    if (outcome === "DEFLECTION") {
      // Partial redirect — keep some of the attacker's ball pattern, no auto-steal.
      this.stats.successfulTackles += 1;
      const keep = 0.48;
      const impulse = 2.2 + Math.random() * 2.4;
      const side = Math.random() < 0.5 ? 1 : -1;
      this.ball.vx = this.ball.vx * keep + defender.slideDirX * impulse + (Math.random() - 0.5) * 1.6;
      this.ball.vz = this.ball.vz * keep + defender.slideDirZ * impulse * 0.7 + side * (0.8 + Math.random() * 1.8);
      this.ball.vy = Math.max(this.ball.vy, 0.25 + Math.random() * 0.35);
      if (holder) {
        holder.ballControlLockout = Math.max(holder.ballControlLockout, 0.28);
        holder.firstTouchTimer = Math.max(holder.firstTouchTimer, 0.16);
        holder.vx += defender.slideDirX * 1.1;
        holder.vz += defender.slideDirZ * 1.1;
        // Often spills fully under REAL disturbance.
        if (Math.random() < 0.55 * this.tuning.defenderDisturbMultiplier) {
          this.stats.turnovers += 1;
          this.makeLoose(holder);
        }
      } else {
        this.clearOwner();
        this.stats.turnovers += 1;
      }
      this.toast("BLOCK");
      return;
    }
    if (outcome === "RETAIN" && holder) {
      // Attacker rides the challenge — defender left on the ground briefly.
      defender.slideRecoverTimer = SLIDE_RECOVER_MISS * 0.75;
      holder.vx *= 1.05;
      holder.vz *= 1.05;
      return;
    }
    if (outcome === "FOUL" || outcome === "YELLOW_CARD" || outcome === "RED_CARD") {
      const card =
        outcome === "RED_CARD" ? "red" : outcome === "YELLOW_CARD" ? "yellow" : "none";
      this.awardTackleFoul(defender, holder, card);
      return;
    }
    // MISS
    defender.slideRecoverTimer = SLIDE_RECOVER_MISS;
  }

  private awardTackleFoul(offender: Player, victim: Player | null, card: "none" | "yellow" | "red"): void {
    const foulX = victim?.x ?? offender.x;
    const foulZ = victim?.z ?? offender.z;
    let resolved: "none" | "yellow" | "red" = card;
    if (card === "yellow" && offender.yellowCards >= 1) resolved = "red";
    this.clock.addFoulTime(resolved === "red" ? 2.4 : resolved === "yellow" ? 2 : 1.6);
    this.clearOffsidePhase();
    this.clearOwner();
    this.pendingPassFrom = null;
    this.passTargetId = null;
    this.longPassLanding = null;
    offender.sliding = false;
    offender.slideTimer = 0;
    this.slideTimed.delete(offender.id);
    this.events.emit("FOUL", { playerId: offender.id, card: resolved });
    if (resolved === "red") {
      this.dismissPlayer(offender);
      this.events.emit("RED_CARD", { playerId: offender.id });
      this.toast(card === "yellow" ? "SECOND YELLOW" : "RED CARD");
    } else if (resolved === "yellow") {
      offender.yellowCards += 1;
      this.toast("YELLOW CARD");
    } else {
      this.toast("FOUL");
    }
    const awarding: "home" | "away" = offender.side === "home" ? "away" : "home";
    this.beginRestart(planFoulRestart(awarding, foulX, foulZ, this.endsFlipped));
  }

  private dismissPlayer(player: Player): void {
    player.sentOff = true;
    player.sliding = false;
    player.hasBall = false;
    player.vx = 0;
    player.vz = 0;
    if (player.mesh) {
      this.sceneRoot.remove(player.mesh);
      player.mesh = null;
    }
    if (this.possessing === player) this.makeLoose(player);
    if (this.controlled.id === player.id) {
      this.controlled = autoSelectPlayer(this.allPlayers(), this.userSide, this.ball.x, this.ball.z);
    }
    if (this.preferredPlayerId === player.id) this.preferredPlayerId = this.controlled.id;
    if (this.pressingId === player.id) this.pressingId = null;
  }

  private handleInterceptions(): void {
    if (this.possessing || !this.ball.lastTouchId) return;
    const passer = this.playerById(this.ball.lastTouchId);
    if (!passer) return;
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    if (speed < 6) {
      this.incomingShot = false;
      return;
    }
    if (this.incomingShot) {
      const wall = this.opponentsOf(passer).filter((p) => !p.isGK && p.distTo(this.ball.x, this.ball.z) < 1.25);
      if (wall.length && (wall.length >= 2 || Math.random() < 0.62)) {
        wall.sort((a, b) => a.distTo(this.ball.x, this.ball.z) - b.distTo(this.ball.x, this.ball.z));
        const shotPower = Math.hypot(this.ball.vx, this.ball.vz);
        ricochetOffDefender(this.ball, wall[0], passer.side, { power: shotPower });
        this.ball.lastTouchId = wall[0].id;
        this.ball.lastTouchSide = wall[0].side;
        this.incomingShot = false;
        this.stats.turnovers += 1;
        return;
      }
    }
    const pred = this.ball.x + this.ball.vx * 0.12;
    const predZ = this.ball.z + this.ball.vz * 0.12;
    const thief = interceptCandidate(passer.x, passer.z, pred, predZ, this.ball.y, this.opponentsOf(passer));
    if (thief && this.throwInOpen && this.throwInTakerId === thief.id) return;
    if (thief && thief.distTo(this.ball.x, this.ball.z) < 0.95 && this.ball.y < 1.45) {
      this.takePossession(thief, this.ball.y > 1.2);
      this.stats.turnovers += 1;
    }
  }

  private collectReceiverSkip(homeSkip: Set<string>, awaySkip: Set<string>): void {
    if (this.possessing) return;
    // Always pull the designated receiver out of TeamAI — steerPassReceiver /
    // guideReceivers own that single run. Skipping this on fast balls used to
    // stack TeamAI + receive steers and launch players far past natural pace.
    if (!this.passTargetId) return;
    const p = this.playerById(this.passTargetId);
    if (!p || p.isGK) return;
    (p.side === "home" ? homeSkip : awaySkip).add(p.id);
  }

  private collectThrowInTakerSkip(homeSkip: Set<string>, awaySkip: Set<string>): void {
    if (!this.throwInOpen || !this.throwInTakerId) return;
    const p = this.playerById(this.throwInTakerId);
    if (!p) return;
    (p.side === "home" ? homeSkip : awaySkip).add(p.id);
  }

  /** After a throw-in, the taker waits on the pitch for a return or holds a defensive lane — never chases the ball. */
  private steerThrowInTaker(dt: number): void {
    if (!this.throwInOpen || !this.throwInTakerId) return;
    const taker = this.playerById(this.throwInTakerId);
    if (!taker || taker.sentOff || taker.sliding) return;
    const side = Math.sign(taker.z || this.ball.z || 1) || 1;
    const wait = {
      x: clamp(taker.x - taker.attackSign * 1.8, -HALF_LENGTH + 3, HALF_LENGTH - 3),
      z: side * (HALF_WIDTH - 5.2),
    };
    // Prefer dropping into a cover lane near their anchor when defending shape matters.
    if (taker.slot.includes("CB") || taker.slot.includes("DM") || taker.slot === "LB" || taker.slot === "RB") {
      wait.x = clamp(taker.anchorX * 0.65 + wait.x * 0.35, -HALF_LENGTH + 4, HALF_LENGTH - 4);
      wait.z = clamp(taker.anchorZ * 0.55 + wait.z * 0.45, -HALF_WIDTH + 3.5, HALF_WIDTH - 3.5);
    }
    taker.desiredX = wait.x;
    taker.desiredZ = wait.z;
    const dx = wait.x - taker.x;
    const dz = wait.z - taker.z;
    if (Math.hypot(dx, dz) > 0.7) {
      movePlayer(taker, dt, dx, dz, false, false, this.moveExtras());
    } else {
      movePlayer(taker, dt, 0, 0, false, false, this.moveExtras());
    }
  }

  private collectOffsideSkip(homeSkip: Set<string>, awaySkip: Set<string>): void {
    for (const id of this.offsidePassIds) {
      const p = this.playerById(id);
      if (!p) continue;
      (p.side === "home" ? homeSkip : awaySkip).add(id);
    }
  }

  private clearOffsidePhase(): void {
    this.offsidePassIds.clear();
  }

  private offsidePlayerInReceiveRange(collectSpeed: number, speed: number): Player | null {
    if (!this.offsidePassIds.size) return null;
    const aerial = this.ball.y > 1.35 || this.incomingAerial;
    // Prefer the designated receiver so through balls into stretchers actually flag.
    const ordered = [
      ...(this.passTargetId && this.offsidePassIds.has(this.passTargetId) ? [this.passTargetId] : []),
      ...[...this.offsidePassIds].filter((id) => id !== this.passTargetId),
    ];
    for (const id of ordered) {
      const p = this.playerById(id);
      if (!p || p.kickTimer > 0) continue;
      const heightM = p.height || 1.82;
      const yCap = aerial ? Math.min(3.4, 1.55 + heightM * 0.85) : Math.min(1.85, 0.55 + heightM * 0.62);
      const designated = id === this.passTargetId;
      const reach = aerial
        ? collectSpeed * (designated ? 1.45 : 1.22)
        : collectSpeed * (designated ? 1.35 : 1.08) * (0.94 + Math.min(0.14, (heightM - 1.7) * 0.35));
      const speedCap = aerial
        ? 16 + (p.attrs.jumping ?? p.attrs.heading ?? 50) * 0.05
        : 12 + p.attrs.control * 0.08;
      if (p.distTo(this.ball.x, this.ball.z) < reach && speed < speedCap && this.ball.y < yCap) {
        return p;
      }
    }
    return null;
  }

  /** Lab / fidelity: phase time shares + ST–offside-line gap while attacking. */
  private sampleFidelityMetrics(dt: number, possessingSide: "home" | "away" | null): void {
    // Autoplay uses AUTOPLAY state — still sample open-play fidelity (phases / width).
    if (
      this.state !== FootballState.PLAYING &&
      this.state !== FootballState.KICK_OFF &&
      this.state !== FootballState.AUTOPLAY
    ) {
      return;
    }
    const lastSide = this.ball.lastTouchSide as "home" | "away" | null;
    const side = possessingSide ?? lastSide;
    if (!side) {
      this.stats.phaseSeconds.loose += dt;
      return;
    }
    // In-flight after a pass still belongs to the touching side's build/attack —
    // only true free scrambles (no recent touch side / contested 50-50) are "loose".
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    const scramble =
      possessingSide == null &&
      (lastSide == null ||
        (speed < 1.2 &&
          this.home.players.some((p) => !p.isGK && p.distTo(this.ball.x, this.ball.z) < 2.4) &&
          this.away.players.some((p) => !p.isGK && p.distTo(this.ball.x, this.ball.z) < 2.4)));
    if (scramble) {
      this.stats.phaseSeconds.loose += dt;
      return;
    }
    const ownedForPhase = possessingSide ?? lastSide;
    const team = side === "home" ? this.home : this.away;
    const opp = side === "home" ? this.away : this.home;
    const attackSign = team.players[0]?.attackSign ?? (side === "home" ? 1 : -1);
    const phase = teamMatchPhase(side, this.ball, ownedForPhase, attackSign, {
      transitionAge: this.possessionChangeAge,
      distGoal: Math.hypot(defendGoalX(side === "home" ? "away" : "home", this.endsFlipped) - this.ball.x, this.ball.z),
    });
    this.stats.phaseSeconds[phase] += dt;
    if (phase === "attack" || phase === "chance" || phase === "build") {
      const strikers = team.players.filter((p) => !p.isGK && !p.sentOff && isStriker(p));
      if (strikers.length) {
        const line = offsideLineX(opp.players, attackSign);
        let sum = 0;
        for (const st of strikers) sum += (line - st.x) * attackSign;
        this.stats.stOffsideGapSamples.push(sum / strikers.length);
        if (this.stats.stOffsideGapSamples.length > 2400) {
          this.stats.stOffsideGapSamples.splice(0, this.stats.stOffsideGapSamples.length - 2400);
        }
      }
      const outfield = team.players.filter((p) => !p.isGK && !p.sentOff);
      if (outfield.length >= 2) {
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const p of outfield) {
          minZ = Math.min(minZ, p.z);
          maxZ = Math.max(maxZ, p.z);
        }
        this.stats.teamWidthSamples.push(maxZ - minZ);
        if (this.stats.teamWidthSamples.length > 1200) {
          this.stats.teamWidthSamples.splice(0, this.stats.teamWidthSamples.length - 1200);
        }
      }
    }
  }

  private awardOffsideFoul(offender: Player): void {
    const defendingSide = offender.side === "home" ? "away" : "home";
    const foulX = this.ball.x;
    const foulZ = this.ball.z;
    this.stats.offsides += 1;
    this.clock.addFoulTime(1.35);
    this.clearOffsidePhase();
    this.clearOwner();
    this.pendingPassFrom = null;
    this.passTargetId = null;
    this.longPassLanding = null;
    this.events.emit("FOUL", { playerId: offender.id });
    this.beginRestart(planOffsideFreeKick(defendingSide, foulX, foulZ));
    this.toast("OFFSIDE");
  }

  private awardThrowInRetouchFoul(offender: Player): void {
    this.clock.addFoulTime(1.45);
    this.throwInOpen = false;
    this.throwInTakerId = null;
    this.pendingPassFrom = null;
    this.passTargetId = null;
    this.longPassLanding = null;
    this.clearOwner();
    const awarding: "home" | "away" = offender.side === "home" ? "away" : "home";
    this.events.emit("FOUL", { playerId: offender.id });
    this.beginRestart(planOffsideFreeKick(awarding, offender.x, offender.z));
    this.toast("ILLEGAL THROW");
  }

  private selectThrowInTarget(intent: InputIntent, taker: Player): Player | null {
    const dir = this.aimDir(intent, taker);
    const inward = -Math.sign(this.ball.z || 1);
    const maxR = throwInMaxDistance(taker.attrs.strength);
    const hold01 = clamp(intent.passHold / 1.1, 0.15, 1);
    const passType: PassType = hold01 > 0.58 || maxR > HALF_WIDTH * 0.78 ? "long" : "short";
    return choosePassTarget(
      taker,
      this.teamOf(taker).players,
      this.opponentsOf(taker),
      this.ball,
      dir.x || taker.attackSign * 0.35,
      inward || dir.z,
      passType,
      { style: "buildup" },
    );
  }

  private steerThrowInReceiver(dt: number, taker: Player, target: Player): void {
    const spot = throwInReceiveSpot(this.ball.x, this.ball.z, taker.attackSign);
    // Strong throwers can call a teammate deeper toward the box.
    const maxR = throwInMaxDistance(taker.attrs.strength);
    const deep = maxR > HALF_WIDTH * 0.72;
    const x = deep ? lerp(spot.x, taker.oppGoalX() - taker.attackSign * 14, 0.22) : spot.x;
    const z = clampInboundZ(spot.z, TOUCHLINE_SAFE_MARGIN);
    target.desiredX = x;
    target.desiredZ = z;
    movePlayer(target, dt, x - target.x, z - target.z, true, false, this.moveExtras());
  }

  private announceInjuryTime(): void {
    if (!this.clock.regulationElapsed || this.injuryAnnounced) return;
    if (this.state === FootballState.HALF_TIME || this.state === FootballState.FULL_TIME) return;
    this.injuryAnnounced = true;
    this.toast(`+${this.clock.injuryBoard} ADDED`);
  }

  /** After injury time expires, wait until the ball leaves either penalty area (or grace). */
  private canBlowPeriodWhistle(dt: number): boolean {
    if (this.ballInAttackingArea()) {
      this.periodWhistleGrace += dt;
      if (this.periodWhistleGrace < 28) return false;
    }
    this.periodWhistleGrace = 0;
    return true;
  }

  private ballInAttackingArea(): boolean {
    return (
      inPenaltyArea(this.ball.x, this.ball.z, "home", this.endsFlipped) ||
      inPenaltyArea(this.ball.x, this.ball.z, "away", this.endsFlipped)
    );
  }

  private guideReceivers(dt: number): void {
    if (this.possessing) return;
    // Prefer live bounce prediction so underhit GK / lofted services still get chased —
    // longPassLanding alone left outlets parked on a marker the ball never reached.
    const predicted = this.ball.y > 0.7 ? predictLanding(this.ball) : null;
    const marker = this.longPassLanding;
    let landing = predicted ?? marker;
    if (predicted && marker) {
      const shortOfMarker = Math.hypot(predicted.x - marker.x, predicted.z - marker.z) > 3.5;
      if (shortOfMarker) landing = predicted;
    }
    if (!landing) return;
    const passer = this.playerById(this.ball.lastTouchId ?? "");
    if (!passer) return;
    // Only the designated target (or a single nearest support) chases the flight —
    // stops two teammates swarming the same bounce.
    const candidates = this.teamOf(passer).players
      .filter((p) => !p.isGK && p.id !== passer.id && !this.offsidePassIds.has(p.id))
      .map((p) => ({ p, d: p.distTo(landing.x, landing.z) }))
      // Always keep the designated outlet — GK kicks often land 20–40 m from release,
      // and the old 16 m gate left them frozen (skipped by TeamAI, never steered).
      .filter((row) => row.d < 16 || row.p.id === this.passTargetId)
      .sort((a, b) => a.d - b.d);
    const primary =
      (this.passTargetId ? candidates.find((c) => c.p.id === this.passTargetId) : null) ?? candidates[0];
    if (!primary) return;
    primary.p.desiredX = landing.x;
    primary.p.desiredZ = landing.z;
    // Ground designated receives are owned by steerPassReceiver — never double-integrate.
    const groundOwned =
      !!this.passTargetId &&
      primary.p.id === this.passTargetId &&
      !receiveIsAerialOwned(this.ball, this.incomingAerial, !!this.longPassLanding);
    if (!groundOwned) {
      const moveEx = this.moveExtras();
      const sprint = primary.d > 8;
      movePlayer(primary.p, dt, landing.x - primary.p.x, landing.z - primary.p.z, sprint, false, {
        ...moveEx,
        speedMul: (moveEx.speedMul ?? 1) * 0.94,
        accelMul: (moveEx.accelMul ?? 1) * 0.88,
      });
    }
    // Second runner holds a far-post / secondary pocket — not the same spot.
    const secondary = candidates.find((c) => c.p.id !== primary.p.id);
    if (secondary && (this.ball.y > 1.2 || this.incomingAerial)) {
      const farZ = landing.z + Math.sign(secondary.p.anchorZ - landing.z || 1) * 6.5;
      secondary.p.desiredX = landing.x - passer.attackSign * 2.5;
      secondary.p.desiredZ = clamp(farZ, -HALF_WIDTH + 3, HALF_WIDTH - 3);
      const moveEx = this.moveExtras();
      movePlayer(
        secondary.p,
        dt,
        secondary.p.desiredX - secondary.p.x,
        secondary.p.desiredZ - secondary.p.z,
        secondary.d > 10,
        false,
        {
          ...moveEx,
          speedMul: (moveEx.speedMul ?? 1) * 0.92,
          accelMul: (moveEx.accelMul ?? 1) * 0.88,
        },
      );
    }
  }

  private steerPassReceiver(dt: number): void {
    if (this.possessing || !this.passTargetId) return;
    // Aerial / lofted: guideReceivers owns the landing run (onside only — see below).
    const offsideTarget = this.offsidePassIds.has(this.passTargetId);
    if (!offsideTarget && receiveIsAerialOwned(this.ball, this.incomingAerial, !!this.longPassLanding)) return;
    const target = this.playerById(this.passTargetId);
    if (!target || target.kickTimer > 0) return;
    const moveEx = this.moveExtras();
    // Offside designated receiver still chases so interference can award the flag.
    const plan = planReceiveRun(target, this.ball, {
      speedMul: (moveEx.speedMul ?? 1) * (offsideTarget ? 1.08 : 1),
    });
    target.desiredX = plan.x;
    target.desiredZ = plan.z;
    movePlayer(target, dt, plan.x - target.x, plan.z - target.z, plan.sprint || offsideTarget, false, {
      ...moveEx,
      speedMul: plan.speedMul,
      accelMul: (moveEx.accelMul ?? 1) * plan.accelMul,
    });
  }

  private steerOffsideRetreat(dt: number): void {
    if (!this.offsidePassIds.size || this.possessing) return;
    // Non-target offsides drop softly onside; the pass target keeps chasing (steerPassReceiver).
    for (const id of this.offsidePassIds) {
      if (id === this.passTargetId) continue;
      const p = this.playerById(id);
      if (!p) continue;
      const t = offsideRetreatTarget(p, this.opponentsOf(p));
      p.desiredX = lerp(p.x, t.x, 0.28);
      p.desiredZ = lerp(p.z, t.z, 0.22);
      movePlayer(p, dt, p.desiredX - p.x, p.desiredZ - p.z, false, false, this.moveExtras());
    }
  }

  /**
   * When 3+ outfielders crowd a slow ball for >1.55s, force a clean break —
   * ownership stays (or goes to the nearest) and the others are pushed out of the ring.
   */
  private breakBallCluster(dt: number): void {
    if (this.state !== FootballState.PLAYING && this.state !== FootballState.AUTOPLAY) {
      this.ballClusterTimer = 0;
      return;
    }
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    if (speed > 2.8 || this.ball.y > 1.1) {
      this.ballClusterTimer = 0;
      return;
    }
    const near = this.allPlayers().filter(
      (p) => !p.isGK && !p.sentOff && !p.celebrating && p.distTo(this.ball.x, this.ball.z) < 2.35,
    );
    if (near.length < 3) {
      this.ballClusterTimer = 0;
      return;
    }
    this.ballClusterTimer += dt;
    if (this.ballClusterTimer < 1.55) return;
    this.ballClusterTimer = 0;
    const owner = this.possessing;
    const keeper =
      owner ?? [...near].sort((a, b) => a.distTo(this.ball.x, this.ball.z) - b.distTo(this.ball.x, this.ball.z))[0]!;
    for (const p of near) {
      if (p.id === keeper.id) continue;
      const away = normalize2(p.x - this.ball.x, p.z - this.ball.z);
      p.x += away.x * 1.85;
      p.z += away.z * 1.85;
      p.vx *= 0.35;
      p.vz *= 0.35;
      p.desiredX = p.x + away.x * 3.5;
      p.desiredZ = p.z + away.z * 3.5;
      p.kickTimer = Math.max(p.kickTimer, 0.35);
    }
    if (owner) {
      owner.ballControlLockout = 0;
      this.ball.vx *= 0.4;
      this.ball.vz *= 0.4;
    } else if (!keeper.isGK) {
      this.takePossession(keeper);
    }
  }

  private recoverStuckBall(dt: number): void {
    const moved = Math.hypot(this.ball.x - this.lastBallX, this.ball.z - this.lastBallZ);
    this.lastBallX = this.ball.x;
    this.lastBallZ = this.ball.z;
    const slow = ballSpeed(this.ball) < 0.18 && moved < 0.08;
    if (isLegalStationary(this.state, !!this.possessing) || !slow) {
      this.stuckTimer = 0;
      this.debug.stuckTimer = 0;
      return;
    }
    this.stuckTimer += dt;
    this.debug.stuckTimer = this.stuckTimer;
    if (isOutOfWorld(this.ball)) {
      this.ball.x = clamp(this.ball.x, -HALF_LENGTH + 2, HALF_LENGTH - 2);
      this.ball.z = clamp(this.ball.z, -HALF_WIDTH + 2, HALF_WIDTH - 2);
      this.ball.y = BALL_RADIUS;
      this.ball.vx = 0;
      this.ball.vz = 0;
    }
    if (this.stuckTimer < 3.4) return;
    const homeBefore = this.homeScore;
    const awayBefore = this.awayScore;
    this.stuckTimer = 0;
    this.stats.stuckRecoveries += 1;
    const chaseSide = this.ball.lastTouchSide === "home" ? "away" : "home";
    const nearest = autoSelectPlayer(this.allPlayers(), chaseSide, this.ball.x, this.ball.z);
    this.ball.x += (Math.random() - 0.5) * 1.2;
    this.ball.z += (Math.random() - 0.5) * 1.2;
    this.makeLoose();
    // Hand the ball to the nearest contesting player so play never stalls forever.
    if (nearest && !nearest.isGK) {
      nearest.x = this.ball.x;
      nearest.z = this.ball.z;
      this.takePossession(nearest);
    }
    this.homeScore = homeBefore;
    this.awayScore = awayBefore;
  }

  /** Top-of-screen callouts — set pieces only (no SAVE / TACKLE / FOUL spam). */
  private static readonly TOAST_ALLOWED = new Set([
    "THROW-IN",
    "CORNER",
    "GOAL KICK",
    "PENALTY",
    "FREE KICK",
    "BALL RETURNED",
  ]);

  private toast(text: string): void {
    if (!Match.TOAST_ALLOWED.has(text)) return;
    this.cameraToast = text;
    this.cameraToastT = 1.4;
  }

  private checkRestarts(): void {
    if (this.practice === "spot") {
      if (inGoal(this.ball, "away")) {
        this.registerGoal(scorerForWorldGoal("away", this.endsFlipped));
        return;
      }
      if (inGoal(this.ball, "home")) {
        this.registerGoal(scorerForWorldGoal("home", this.endsFlipped));
        return;
      }
      if (outOfPitch(this.ball)) this.spotResetT = Math.max(this.spotResetT, 0.85);
      return;
    }
    if (inGoal(this.ball, "away")) {
      this.registerGoal(scorerForWorldGoal("away", this.endsFlipped));
      return;
    }
    if (inGoal(this.ball, "home")) {
      this.registerGoal(scorerForWorldGoal("home", this.endsFlipped));
      return;
    }
    const out = outOfPitch(this.ball);
    if (!out) return;
    this.beginRestart(planRestart(out, this.ball.lastTouchSide, this.ball.x, this.ball.z, this.endsFlipped));
  }

  private beginRestart(plan: RestartPlan): void {
    this.clearOffsidePhase();
    this.throwInOpen = false;
    this.throwInTakerId = null;
    this.state = plan.type;
    this.events.emit("REFEREE_WHISTLE", { reason: "restart" });
    this.tryFlushPendingSubs();
    this.restartElapsed = 0;
    this.restartSpot = { x: plan.ballX, z: plan.ballZ };
    this.ballState = "restart";

    const exitX = this.ball.x;
    const exitZ = this.ball.z;
    const exitY = Math.max(BALL_RADIUS, this.ball.y);
    const deepStands =
      Math.abs(exitZ) > HALF_WIDTH + 1.85 ||
      Math.abs(exitX) > HALF_LENGTH + 1.85 ||
      exitY > 3.4;

    if (plan.type === "GOAL_KICK") {
      const own = defendGoalX(plan.takingSide, this.endsFlipped);
      const pickX = own < 0 ? -HALF_LENGTH + 0.95 : HALF_LENGTH - 0.95;
      const pickZ = clamp(exitZ, -HALF_WIDTH + 1.2, HALF_WIDTH - 1.2);
      this.clearOwner();
      this.ball.vx = 0;
      this.ball.vz = 0;
      this.ball.vy = 0;
      this.ball.ownerId = null;
      this.ball.x = clamp(exitX, -HALF_LENGTH - 6, HALF_LENGTH + 6);
      this.ball.z = clamp(exitZ, -HALF_WIDTH - 7, HALF_WIDTH + 7);
      this.ball.y = exitY;
      this.restartPrep = {
        kind: "goal_kick",
        phase: deepStands ? "return" : "collect",
        plan,
        exitX: this.ball.x,
        exitZ: this.ball.z,
        exitY,
        pickX,
        pickZ,
        t: 0,
      };
      const gk = plan.takingSide === "home" ? this.home.gk() : this.away.gk();
      this.arrangeSetPiece(plan.type, plan.takingSide, plan.ballX, plan.ballZ, gk.id);
      this.toast(restartLabel(plan.type));
      this.snapshotPoses();
      return;
    }

    if (plan.type === "CORNER") {
      // Same spirit as goal kicks: taker walks to the ball, carries it to the arc, places it.
      const taker = autoSelectPlayer(this.allPlayers(), plan.takingSide, plan.ballX, plan.ballZ);
      this.clearOwner();
      this.ball.vx = 0;
      this.ball.vz = 0;
      this.ball.vy = 0;
      this.ball.ownerId = null;
      this.ball.x = clamp(exitX, -HALF_LENGTH - 4, HALF_LENGTH + 4);
      this.ball.z = clamp(exitZ, -HALF_WIDTH - 5, HALF_WIDTH + 5);
      this.ball.y = exitY;
      // Deep stands: lob toward a collectible spot just inside the flag, then walk-place.
      const zSign = Math.sign(plan.ballZ || 1) || 1;
      const xSign = Math.sign(plan.ballX || 1) || 1;
      const pickX = deepStands ? plan.ballX - xSign * 1.4 : this.ball.x;
      const pickZ = deepStands ? plan.ballZ - zSign * 1.4 : this.ball.z;
      this.restartPrep = {
        kind: "corner",
        phase: deepStands ? "return" : "collect",
        plan,
        exitX: this.ball.x,
        exitZ: this.ball.z,
        exitY,
        pickX,
        pickZ,
        t: 0,
        takerId: taker.id,
      };
      this.arrangeSetPiece(plan.type, plan.takingSide, plan.ballX, plan.ballZ, taker.id, true);
      if (!this.autoplay && taker.side === this.userSide) this.controlled = taker;
      this.toast(deepStands ? "BALL RETURNED" : restartLabel(plan.type));
      this.snapshotPoses();
      return;
    }

    if (deepStands && plan.type === "THROW_IN") {
      this.clearOwner();
      this.ball.vx = 0;
      this.ball.vz = 0;
      this.ball.vy = 0;
      this.ball.ownerId = null;
      this.restartPrep = {
        kind: "stands_return",
        phase: "return",
        plan,
        exitX,
        exitZ,
        exitY,
        pickX: plan.ballX,
        pickZ: plan.ballZ,
        t: 0,
      };
      const taker = autoSelectPlayer(this.allPlayers(), plan.takingSide, plan.ballX, plan.ballZ);
      this.arrangeSetPiece(plan.type, plan.takingSide, plan.ballX, plan.ballZ, taker.id);
      this.toast("BALL RETURNED");
      this.snapshotPoses();
      return;
    }

    if (plan.type === "FREE_KICK") {
      const taker = selectSetPieceTaker(this.allPlayers(), plan.takingSide, plan.ballX, plan.ballZ);
      const spotDist = Math.hypot(this.ball.x - plan.ballX, this.ball.z - plan.ballZ);
      if (spotDist < 2.4 && !deepStands) {
        this.placeRestartReady(plan);
        return;
      }
      const feeder =
        this.allPlayers()
          .filter(
            (p) =>
              p.side === plan.takingSide &&
              p.id !== taker.id &&
              !p.isGK &&
              !p.sentOff &&
              p.distTo(this.ball.x, this.ball.z) < 16,
          )
          .sort((a, b) => a.distTo(this.ball.x, this.ball.z) - b.distTo(this.ball.x, this.ball.z))[0] ?? null;
      const canFeed = !!feeder && spotDist < 32 && feeder.distTo(this.ball.x, this.ball.z) < 12;
      this.clearOwner();
      this.ball.vx = 0;
      this.ball.vz = 0;
      this.ball.vy = 0;
      this.ball.ownerId = null;
      this.restartPrep = {
        kind: "free_kick",
        phase: deepStands ? "return" : canFeed ? "feed" : "collect",
        plan,
        exitX: this.ball.x,
        exitZ: this.ball.z,
        exitY: Math.max(BALL_RADIUS, this.ball.y),
        pickX: plan.ballX,
        pickZ: plan.ballZ,
        t: 0,
        takerId: taker.id,
        feederId: canFeed ? feeder!.id : undefined,
      };
      this.arrangeSetPiece(plan.type, plan.takingSide, plan.ballX, plan.ballZ, taker.id, true);
      if (!this.autoplay && taker.side === this.userSide) this.controlled = taker;
      this.toast(canFeed ? "FREE KICK — LAY OFF" : "FREE KICK — PLACE");
      this.snapshotPoses();
      return;
    }

    this.placeRestartReady(plan);
  }

  /** Plant taker + ball at the restart spot (after any collect / throw-back ceremony). */
  private placeRestartReady(plan: RestartPlan): void {
    this.restartPrep = null;
    this.restartElapsed = 0;
    this.restartSpot = { x: plan.ballX, z: plan.ballZ };
    this.ball.reset(plan.ballX, plan.ballZ);
    const taker =
      plan.type === "GOAL_KICK"
        ? plan.takingSide === "home"
          ? this.home.gk()
          : this.away.gk()
        : plan.type === "FREE_KICK" || plan.type === "PENALTY"
          ? selectSetPieceTaker(this.allPlayers(), plan.takingSide, plan.ballX, plan.ballZ)
          : autoSelectPlayer(this.allPlayers(), plan.takingSide, plan.ballX, plan.ballZ);
    const inward = plan.type === "THROW_IN" ? -Math.sign(plan.ballZ || 1) : 0;
    if (plan.type === "THROW_IN") {
      taker.x = plan.ballX;
      taker.z = Math.sign(plan.ballZ || 1) * (HALF_WIDTH + 0.18);
      taker.facing = Math.atan2(0, inward);
    } else if (plan.type === "CORNER") {
      const takingDir = plan.takingSide === "home" ? (this.endsFlipped ? -1 : 1) : this.endsFlipped ? 1 : -1;
      const boxX = takingDir * (HALF_LENGTH - 11);
      const zSign = Math.sign(plan.ballZ || 1);
      // Stand just inside the arc, facing the box (safe when ends are flipped).
      taker.x = plan.ballX - Math.sign(plan.ballX || takingDir) * 0.7;
      taker.z = plan.ballZ - zSign * 0.55;
      taker.facing = Math.atan2(boxX - taker.x, 0 - taker.z);
    } else if (plan.type === "FREE_KICK") {
      const dir = plan.takingSide === "home" ? (this.endsFlipped ? -1 : 1) : this.endsFlipped ? 1 : -1;
      taker.x = plan.ballX - dir * 1.15;
      taker.z = plan.ballZ;
      taker.facing = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (plan.type === "PENALTY") {
      const dir = Math.sign(plan.ballX) || 1;
      taker.x = plan.ballX - dir * 1.2;
      taker.z = 0;
      taker.facing = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const inset = -taker.attackSign * 0.85;
      taker.x = plan.ballX + inset;
      taker.z = plan.ballZ;
      taker.facing = taker.attackSign > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    taker.vx = 0;
    taker.vz = 0;
    this.takePossession(taker);
    taker.firstTouchTimer = 0;
    this.ballState = "restart";
    this.arrangeSetPiece(plan.type, plan.takingSide, plan.ballX, plan.ballZ, taker.id);
    // Goal kicks included — user must be able to shape a long ball to the strikers.
    if (!this.autoplay && taker.side === this.userSide) this.controlled = taker;
    this.toast(restartLabel(plan.type));
    this.snapshotPoses();
  }

  private stepRestartPrep(dt: number): void {
    const prep = this.restartPrep;
    if (!prep) return;
    const moveEx = this.moveExtras();
    const spot = this.restartSpot ?? { x: prep.plan.ballX, z: prep.plan.ballZ };

    if (prep.phase === "return") {
      prep.t += dt;
      const dur =
        prep.kind === "goal_kick" ? 1.05 : prep.kind === "corner" ? 1.1 : prep.kind === "free_kick" ? 1.15 : 1.25;
      const u = clamp(prep.t / dur, 0, 1);
      const ease = u * u * (3 - 2 * u);
      const toX =
        prep.kind === "goal_kick" || prep.kind === "corner" || prep.kind === "free_kick"
          ? prep.pickX
          : prep.plan.ballX;
      const toZ =
        prep.kind === "goal_kick" || prep.kind === "corner" || prep.kind === "free_kick"
          ? prep.pickZ
          : prep.plan.ballZ;
      this.ball.x = lerp(prep.exitX, toX, ease);
      this.ball.z = lerp(prep.exitZ, toZ, ease);
      const arc = Math.sin(ease * Math.PI) * (prep.kind === "goal_kick" ? 2.4 : 3.1);
      this.ball.y = Math.max(BALL_RADIUS, lerp(prep.exitY, BALL_RADIUS, ease) + arc);
      this.ball.vx = 0;
      this.ball.vz = 0;
      this.ball.vy = 0;
      if (u < 1) return;
      this.ball.x = toX;
      this.ball.z = toZ;
      this.ball.y = BALL_RADIUS;
      if (prep.kind === "stands_return") {
        this.placeRestartReady(prep.plan);
        return;
      }
      if (prep.kind === "free_kick") {
        // Ball rolled to the foul spot — plant taker and take.
        this.placeRestartReady(prep.plan);
        return;
      }
      // Goal kick + corner: after the lob, the taker walks to collect.
      prep.phase = "collect";
      prep.t = 0;
      prep.exitX = toX;
      prep.exitZ = toZ;
      prep.exitY = BALL_RADIUS;
      return;
    }

    if (prep.kind === "free_kick") {
      this.stepFreeKickPrep(dt, prep as Extract<typeof prep, { kind: "free_kick" }>, moveEx, spot);
      return;
    }

    if (prep.kind === "corner") {
      this.stepCornerPrep(dt, prep as Extract<typeof prep, { kind: "corner" }>, moveEx, spot);
      return;
    }

    const gk =
      prep.plan.takingSide === "home" ? this.home.gk() : this.away.gk();

    if (prep.phase === "collect") {
      prep.t += dt;
      const tx = this.ball.x - gk.x;
      const tz = this.ball.z - gk.z;
      movePlayer(gk, dt, tx, tz, true, false, moveEx);
      gk.facing = Math.atan2(tx, tz);
      // Snap if the ball sits outside reachable pitch (GK would hang forever).
      const reached = gk.distTo(this.ball.x, this.ball.z) < 1.35 || prep.t > 3.6;
      if (reached) {
        if (gk.distTo(this.ball.x, this.ball.z) >= 1.35) {
          this.ball.x = gk.x;
          this.ball.z = gk.z;
          this.ball.y = BALL_RADIUS;
        }
        this.takePossession(gk);
        gk.firstTouchTimer = 0;
        this.faceKeeperToPlay(gk);
        prep.phase = "carry";
        prep.t = 0;
      }
      return;
    }

    if (prep.phase === "carry") {
      prep.t += dt;
      if (this.possessing !== gk) this.takePossession(gk);
      const inset = -gk.attackSign * 0.85;
      const destX = spot.x + inset;
      const destZ = spot.z;
      const dx = destX - gk.x;
      const dz = destZ - gk.z;
      movePlayer(gk, dt, dx, dz, false, false, moveEx);
      // Cradle while walking to the six-yard spot.
      const fx = Math.sin(gk.facing);
      const fz = Math.cos(gk.facing);
      this.ball.x = gk.x + fx * 0.32;
      this.ball.z = gk.z + fz * 0.32;
      this.ball.y = 1.08;
      this.ball.vx = 0;
      this.ball.vz = 0;
      this.ball.vy = 0;
      this.ball.ownerId = gk.id;
      if (Math.hypot(dx, dz) < 1.15 || prep.t > 5.5) {
        gk.x = destX;
        gk.z = destZ;
        gk.vx = 0;
        gk.vz = 0;
        gk.facing = gk.attackSign > 0 ? Math.PI / 2 : -Math.PI / 2;
        prep.phase = "place";
        prep.t = 0;
      }
      return;
    }

    // place — set the ball down for the goal kick
    prep.t += dt;
    const placeU = clamp(prep.t / 0.55, 0, 1);
    const inset = -gk.attackSign * 0.85;
    gk.x = spot.x + inset;
    gk.z = spot.z;
    gk.vx = 0;
    gk.vz = 0;
    gk.facing = gk.attackSign > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.ball.x = spot.x;
    this.ball.z = spot.z;
    this.ball.y = lerp(1.08, BALL_RADIUS, placeU);
    this.ball.vx = 0;
    this.ball.vz = 0;
    this.ball.vy = 0;
    this.ball.ownerId = gk.id;
    if (placeU < 1) return;
    this.ball.y = BALL_RADIUS;
    if (this.possessing !== gk) this.takePossession(gk);
    gk.firstTouchTimer = 0;
    this.restartPrep = null;
    this.restartElapsed = 0;
    this.toast("GOAL KICK");
  }

  /** Corner plant: just inside the arc, facing the box. */
  private cornerPlantPose(taker: Player, spot: { x: number; z: number }): { x: number; z: number; facing: number } {
    const takingDir = taker.side === "home" ? (this.endsFlipped ? -1 : 1) : this.endsFlipped ? 1 : -1;
    const zSign = Math.sign(spot.z || 1) || 1;
    const x = spot.x - Math.sign(spot.x || takingDir) * 0.7;
    const z = spot.z - zSign * 0.55;
    const boxX = takingDir * (HALF_LENGTH - 11);
    return { x, z, facing: Math.atan2(boxX - x, 0 - z) };
  }

  /**
   * Corner ceremony: taker collects the loose ball (or the stands return),
   * walks it to the arc, and places it — same beat as a goal-kick collect.
   */
  private stepCornerPrep(
    dt: number,
    prep: {
      kind: "corner";
      phase: "return" | "feed" | "collect" | "carry" | "place";
      plan: RestartPlan;
      exitX: number;
      exitZ: number;
      exitY: number;
      pickX: number;
      pickZ: number;
      t: number;
      takerId?: string;
    },
    moveEx: ReturnType<Match["moveExtras"]>,
    spot: { x: number; z: number },
  ): void {
    const taker = prep.takerId ? this.playerById(prep.takerId) : null;
    if (!taker) {
      this.placeRestartReady(prep.plan);
      return;
    }

    if (prep.phase === "collect") {
      prep.t += dt;
      const dx = this.ball.x - taker.x;
      const dz = this.ball.z - taker.z;
      movePlayer(taker, dt, dx, dz, true, false, moveEx);
      taker.facing = Math.atan2(dx, dz);
      const reached = taker.distTo(this.ball.x, this.ball.z) < 1.35 || prep.t > 4.2;
      if (!reached) return;
      if (taker.distTo(this.ball.x, this.ball.z) >= 1.35) {
        this.ball.x = taker.x;
        this.ball.z = taker.z;
        this.ball.y = BALL_RADIUS;
      }
      this.takePossession(taker);
      taker.firstTouchTimer = 0;
      prep.phase = "carry";
      prep.t = 0;
      return;
    }

    if (prep.phase === "carry") {
      prep.t += dt;
      if (this.possessing !== taker) this.takePossession(taker);
      const plant = this.cornerPlantPose(taker, spot);
      const dx = plant.x - taker.x;
      const dz = plant.z - taker.z;
      movePlayer(taker, dt, dx, dz, false, false, moveEx);
      const fx = Math.sin(taker.facing);
      const fz = Math.cos(taker.facing);
      this.ball.x = taker.x + fx * 0.35;
      this.ball.z = taker.z + fz * 0.35;
      this.ball.y = 0.22;
      this.ball.vx = 0;
      this.ball.vz = 0;
      this.ball.vy = 0;
      this.ball.ownerId = taker.id;
      if (Math.hypot(dx, dz) < 1.2 || prep.t > 5.8) {
        taker.x = plant.x;
        taker.z = plant.z;
        taker.vx = 0;
        taker.vz = 0;
        taker.facing = plant.facing;
        prep.phase = "place";
        prep.t = 0;
      }
      return;
    }

    // place — set the ball on the corner arc
    prep.t += dt;
    const placeU = clamp(prep.t / 0.48, 0, 1);
    const plant = this.cornerPlantPose(taker, spot);
    taker.x = plant.x;
    taker.z = plant.z;
    taker.vx = 0;
    taker.vz = 0;
    taker.facing = plant.facing;
    this.ball.x = spot.x;
    this.ball.z = spot.z;
    this.ball.y = lerp(0.22, BALL_RADIUS, placeU);
    this.ball.vx = 0;
    this.ball.vz = 0;
    this.ball.vy = 0;
    this.ball.ownerId = taker.id;
    if (placeU < 1) return;
    this.ball.y = BALL_RADIUS;
    this.placeRestartReady(prep.plan);
  }

  /**
   * Free-kick ceremony: teammate feeds the ball to the spot, or the taker
   * collects it and places it ready to strike.
   */
  private stepFreeKickPrep(
    dt: number,
    prep: {
      kind: "free_kick";
      phase: "return" | "feed" | "collect" | "carry" | "place";
      plan: RestartPlan;
      exitX: number;
      exitZ: number;
      exitY: number;
      pickX: number;
      pickZ: number;
      t: number;
      takerId?: string;
      feederId?: string;
    },
    moveEx: ReturnType<Match["moveExtras"]>,
    spot: { x: number; z: number },
  ): void {
    const taker = prep.takerId ? this.playerById(prep.takerId) : null;
    if (!taker) {
      this.placeRestartReady(prep.plan);
      return;
    }

    if (prep.phase === "feed") {
      prep.t += dt;
      const feeder = prep.feederId ? this.playerById(prep.feederId) : null;
      if (!feeder) {
        prep.phase = "collect";
        prep.t = 0;
        return;
      }
      const dx = this.ball.x - feeder.x;
      const dz = this.ball.z - feeder.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.4 && prep.t < 2.8) {
        movePlayer(feeder, dt, dx, dz, true, false, moveEx);
        feeder.facing = Math.atan2(dx, dz);
        return;
      }
      // Kick / roll the ball into the foul spot for the taker.
      prep.phase = "return";
      prep.t = 0;
      prep.exitX = this.ball.x;
      prep.exitZ = this.ball.z;
      prep.exitY = Math.max(BALL_RADIUS, this.ball.y);
      prep.pickX = spot.x;
      prep.pickZ = spot.z;
      feeder.vx = 0;
      feeder.vz = 0;
      feeder.kickTimer = 0.35;
      feeder.facing = Math.atan2(spot.x - feeder.x, spot.z - feeder.z);
      this.toast("FREE KICK");
      return;
    }

    if (prep.phase === "collect") {
      prep.t += dt;
      const dx = this.ball.x - taker.x;
      const dz = this.ball.z - taker.z;
      movePlayer(taker, dt, dx, dz, true, false, moveEx);
      taker.facing = Math.atan2(dx, dz);
      const reached = taker.distTo(this.ball.x, this.ball.z) < 1.35 || prep.t > 4.2;
      if (!reached) return;
      if (taker.distTo(this.ball.x, this.ball.z) >= 1.35) {
        this.ball.x = taker.x;
        this.ball.z = taker.z;
        this.ball.y = BALL_RADIUS;
      }
      this.takePossession(taker);
      taker.firstTouchTimer = 0;
      prep.phase = "carry";
      prep.t = 0;
      return;
    }

    if (prep.phase === "carry") {
      prep.t += dt;
      if (this.possessing !== taker) this.takePossession(taker);
      const dir = prep.plan.takingSide === "home" ? (this.endsFlipped ? -1 : 1) : this.endsFlipped ? 1 : -1;
      const destX = spot.x - dir * 1.15;
      const destZ = spot.z;
      const dx = destX - taker.x;
      const dz = destZ - taker.z;
      movePlayer(taker, dt, dx, dz, false, false, moveEx);
      const fx = Math.sin(taker.facing);
      const fz = Math.cos(taker.facing);
      this.ball.x = taker.x + fx * 0.35;
      this.ball.z = taker.z + fz * 0.35;
      this.ball.y = 0.22;
      this.ball.vx = 0;
      this.ball.vz = 0;
      this.ball.vy = 0;
      this.ball.ownerId = taker.id;
      if (Math.hypot(dx, dz) < 1.2 || prep.t > 5.8) {
        taker.x = destX;
        taker.z = destZ;
        taker.vx = 0;
        taker.vz = 0;
        taker.facing = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        prep.phase = "place";
        prep.t = 0;
      }
      return;
    }

    // place — set the ball on the foul spot
    prep.t += dt;
    const placeU = clamp(prep.t / 0.48, 0, 1);
    const dir = prep.plan.takingSide === "home" ? (this.endsFlipped ? -1 : 1) : this.endsFlipped ? 1 : -1;
    taker.x = spot.x - dir * 1.15;
    taker.z = spot.z;
    taker.vx = 0;
    taker.vz = 0;
    taker.facing = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.ball.x = spot.x;
    this.ball.z = spot.z;
    this.ball.y = lerp(0.22, BALL_RADIUS, placeU);
    this.ball.vx = 0;
    this.ball.vz = 0;
    this.ball.vy = 0;
    this.ball.ownerId = taker.id;
    if (placeU < 1) return;
    this.ball.y = BALL_RADIUS;
    this.placeRestartReady(prep.plan);
  }

  private stepRestart(dt: number, intent: InputIntent): void {
    if (this.restartPrep) {
      this.stepRestartPrep(dt);
      const prep = this.restartPrep;
      const skip = new Set<string>();
      const takerSide = prep?.plan.takingSide ?? this.possessing?.side ?? "home";
      const gk =
        takerSide === "home" ? this.home.gk() : this.away.gk();
      if (prep?.kind === "goal_kick") skip.add(gk.id);
      if (prep?.kind === "corner" && prep.takerId) skip.add(prep.takerId);
      if (prep?.kind === "free_kick") {
        if (prep.takerId) skip.add(prep.takerId);
        if (prep.feederId) skip.add(prep.feederId);
      }
      if (this.possessing) skip.add(this.possessing.id);
      const spot = this.restartSpot ?? { x: this.ball.x, z: this.ball.z };
      const piece = {
        kind: this.state as SetPieceKind,
        takingSide: takerSide,
        ballX: spot.x,
        ballZ: spot.z,
        takerId: this.possessing?.id ?? gk.id,
        endsFlipped: this.endsFlipped,
      };
      updateTeamAI(this.allPlayers(), "home", this.ball, takerSide, dt, skip, {
        tuning: this.tuning,
        grip: this.env.playerGripMultiplier,
        setPiece: piece,
        drainMul: this.tuning.staminaDrainMultiplier,
        matchDrainScale: staminaMatchDrainScale(this.clock.duration),
      });
      updateTeamAI(this.allPlayers(), "away", this.ball, takerSide, dt, skip, {
        tuning: this.tuning,
        grip: this.env.playerGripMultiplier,
        setPiece: piece,
        drainMul: this.tuning.staminaDrainMultiplier,
        matchDrainScale: staminaMatchDrainScale(this.clock.duration),
      });
      return;
    }

    this.restartElapsed += dt;
    const taker = this.possessing;
    const skip = new Set<string>();
    const moveEx = this.moveExtras();
    const goalKick = this.state === FootballState.GOAL_KICK;
    const freeKick = this.state === FootballState.FREE_KICK || this.state === FootballState.PENALTY;
    const corner = this.state === FootballState.CORNER;
    const spot = this.restartSpot;
    if (taker) {
      skip.add(taker.id);
      const userTake = !this.autoplay && taker.id === this.controlled.id;
      if (goalKick && spot) {
        const inset = -taker.attackSign * 0.85;
        taker.x = spot.x + inset;
        taker.z = spot.z;
        taker.vx = 0;
        taker.vz = 0;
        if (userTake) {
          const dir = this.aimDir(intent, taker);
          if (Math.hypot(dir.x, dir.z) > 0.12) taker.facing = Math.atan2(dir.x, dir.z);
        } else {
          taker.facing = taker.attackSign > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        this.ball.reset(spot.x, spot.z);
        this.ball.ownerId = taker.id;
      } else if (corner && spot) {
        // Plant on the arc facing the box — never dribble before the kick.
        const takingDir = taker.side === "home" ? (this.endsFlipped ? -1 : 1) : this.endsFlipped ? 1 : -1;
        const boxX = takingDir * (HALF_LENGTH - 11);
        const zSign = Math.sign(spot.z || 1);
        if (!userTake) {
          taker.x = spot.x - Math.sign(spot.x || takingDir) * 0.7;
          taker.z = spot.z - zSign * 0.55;
          taker.vx = 0;
          taker.vz = 0;
          taker.facing = Math.atan2(boxX - taker.x, 0 - taker.z);
        } else {
          controlPlayer(taker, intent, dt, 0, moveEx);
          const dist = Math.hypot(taker.x - spot.x, taker.z - spot.z);
          if (dist > 2.2) {
            const nx = (spot.x - taker.x) / dist;
            const nz = (spot.z - taker.z) / dist;
            taker.x = spot.x - nx * 2.2;
            taker.z = spot.z - nz * 2.2;
          }
          const aim = this.aimDir(intent, taker);
          if (Math.hypot(aim.x, aim.z) > 0.12) taker.facing = Math.atan2(aim.x, aim.z);
        }
        this.ball.reset(spot.x, spot.z);
        this.ball.ownerId = taker.id;
      } else if (freeKick && spot) {
        const dir = taker.attackSign;
        if (!userTake) {
          taker.x = spot.x - dir * 1.15;
          taker.z = spot.z;
          taker.vx = 0;
          taker.vz = 0;
          taker.facing = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          controlPlayer(taker, intent, dt, 0, moveEx);
          const dist = Math.hypot(taker.x - spot.x, taker.z - spot.z);
          if (dist > 2.4) {
            const nx = (spot.x - taker.x) / dist;
            const nz = (spot.z - taker.z) / dist;
            taker.x = spot.x - nx * 2.4;
            taker.z = spot.z - nz * 2.4;
          }
        }
        this.ball.reset(spot.x, spot.z);
        this.ball.ownerId = taker.id;
      } else if (userTake) {
        controlPlayer(taker, intent, dt, 0, moveEx);
        if (this.state === FootballState.THROW_IN) {
          const side = Math.sign(this.ball.z || 1);
          taker.z = side * (HALF_WIDTH + 0.18);
          taker.x = clamp(taker.x, -HALF_LENGTH + 2, HALF_LENGTH - 2);
          taker.facing = Math.atan2(0, -side);
        }
      } else {
        movePlayer(taker, dt, this.ball.x - taker.x, this.ball.z - taker.z, false, false, moveEx);
      }
      if (goalKick && spot) {
        // Ball already pinned above.
      } else if (corner && spot) {
        // Ball already pinned above.
      } else if (freeKick && spot) {
        // Ball already pinned above.
      } else if (this.state === FootballState.THROW_IN) {
        this.ball.x = taker.x;
        this.ball.z = Math.sign(this.ball.z || 1) * (HALF_WIDTH - 0.32);
        this.ball.y = 1.55;
        this.ball.vx = 0;
        this.ball.vz = 0;
        this.ball.vy = 0;
        // Keep arms up while holding — release extends throwTimer further.
        taker.throwTimer = Math.max(taker.throwTimer, 0.18);
        taker.kickTimer = 0;
      } else {
        dribbleBall(this.ball, taker.x, taker.z, taker.facing, taker.attrs.control);
      }
    }
    const restSkip = new Set(skip);
    let throwTarget: Player | null = null;
    if (this.state === FootballState.THROW_IN && taker) {
      throwTarget = this.selectThrowInTarget(intent, taker);
      this.passTargetId = throwTarget?.id ?? null;
      if (throwTarget) {
        restSkip.add(throwTarget.id);
        this.steerThrowInReceiver(dt, taker, throwTarget);
      }
    }
    const piece = {
      kind: this.state as SetPieceKind,
      takingSide: taker?.side ?? "home",
      ballX: spot?.x ?? this.ball.x,
      ballZ: spot?.z ?? this.ball.z,
      takerId: taker?.id ?? null,
      endsFlipped: this.endsFlipped,
    };
    updateTeamAI(this.allPlayers(), "home", this.ball, taker?.side ?? null, dt, restSkip, {
      tuning: this.tuning,
      grip: this.env.playerGripMultiplier,
      setPiece: piece,
      drainMul: this.tuning.staminaDrainMultiplier,
      matchDrainScale: staminaMatchDrainScale(this.clock.duration),
    });
    updateTeamAI(this.allPlayers(), "away", this.ball, taker?.side ?? null, dt, restSkip, {
      tuning: this.tuning,
      grip: this.env.playerGripMultiplier,
      setPiece: piece,
      drainMul: this.tuning.staminaDrainMultiplier,
      matchDrainScale: staminaMatchDrainScale(this.clock.duration),
    });
    if (
      this.state === FootballState.FREE_KICK &&
      !this.autoplay &&
      taker &&
      taker.id === this.controlled.id
    ) {
      if (intent.shootHeld || intent.shoot) this.shotTarget = aimOnGoal(intent.aimX, intent.aimY, this.invertShotY);
      else this.shotTarget = null;
      this.shootCharge = intent.shootHeld || intent.shoot ? clamp(intent.shootHold / 1.15, 0, 1.25) : 0;
      this.updateShotMarker(intent);
    }
    const auto = this.autoplay || !taker || taker.id !== this.controlled.id;
    const userKick = !this.autoplay && taker?.id === this.controlled.id && (intent.pass || intent.shoot || intent.cross || intent.through);
    const close = !taker || taker.distTo(this.ball.x, this.ball.z) < 2.2;
    if (userKick || (restartDue(this.restartElapsed, auto) && (close || this.restartElapsed >= 4.85))) this.executeRestart(intent);
  }

  private executeRestart(intent: InputIntent): void {
    const taker = this.possessing;
    if (!taker || !isRestartState(this.state)) {
      this.resumePlay();
      return;
    }
    const kind = this.state;
    const inward = -Math.sign(this.ball.z || 1);
    const forward = taker.attackSign;
    if (kind === FootballState.THROW_IN) {
      const dir = this.aimDir(intent, taker);
      const inwardAim = inward || dir.z;
      const maxR = throwInMaxDistance(taker.attrs.strength);
      const hold01 = this.autoplay
        ? clamp(0.35 + stat01(taker.attrs.strength) * 0.55, 0.35, 0.95)
        : clamp(intent.passHold / 1.1, 0.15, 1);
      const passType: PassType = hold01 > 0.58 || maxR > HALF_WIDTH * 0.78 ? "long" : "short";
      const target =
        this.selectThrowInTarget(intent, taker) ??
        choosePassTarget(taker, this.teamOf(taker).players, this.opponentsOf(taker), this.ball, dir.x, inwardAim, passType, {
          style: "buildup",
        });
      const receive = throwInReceiveSpot(this.ball.x, this.ball.z, forward);
      // Blend teammate feet with inbound receive spot — never aim raw feet on the touchline.
      const aimX = target ? target.x * 0.55 + receive.x * 0.45 : taker.x + (dir.x || forward) * Math.min(14, maxR * 0.55);
      const aimZ = target
        ? clampInboundZ(target.z * 0.35 + receive.z * 0.65, TOUCHLINE_SAFE_MARGIN)
        : this.ball.z + inward * Math.min(12, maxR * 0.45);
      const land = throwInLanding(this.ball.x, this.ball.z, aimX, aimZ, taker.attrs.strength, hold01);
      const landZ = clampInboundZ(land.z, TOUCHLINE_SAFE_MARGIN);
      const kick = throwInKickVector(this.ball.x, this.ball.z, land.x, landZ, taker.attrs.strength, hold01);
      // Start the overhead throw from chest height so it reads as a hand release.
      this.ball.y = Math.max(this.ball.y, 1.55);
      kickBall(this.ball, kick.vx, kick.vz, kick.vy);
      this.passTargetId = target?.id ?? null;
      this.longPassLanding = { x: land.x, z: landZ };
      this.throwInOpen = true;
      this.throwInTakerId = taker.id;
      taker.throwTimer = 0.58;
      taker.handRelease = false;
      taker.kickTimer = 0;
      // Delay stepping onto the pitch so the throw pose is visible first.
      const side = Math.sign(this.ball.z || 1) || 1;
      this.pendingThrowStepIn = {
        playerId: taker.id,
        x: clamp(taker.x - taker.attackSign * 1.2, -HALF_LENGTH + 3, HALF_LENGTH - 3),
        z: side * (HALF_WIDTH - 4.8),
        t: 0.28,
      };
      taker.vx = 0;
      taker.vz = 0;
    } else if (kind === FootballState.CORNER) {
      const boxX = taker.oppGoalX() - taker.attackSign * 11;
      const boxZ = Math.sign(this.ball.z || 1) * 4.5;
      const target = this.teamOf(taker).players.find((p) => p.slot.includes("ST")) ?? null;
      // Aim at the penalty spot / near the six-yard line so the delivery clears the box edge.
      const tx = target ? target.x * 0.25 + boxX * 0.75 : boxX;
      const tz = target ? target.z * 0.3 + boxZ * 0.7 : boxZ;
      const kick = passKickVector(this.ball.x, this.ball.z, tx, tz, "cross");
      const reach = Math.max(1, Math.hypot(tx - this.ball.x, tz - this.ball.z));
      const speed = Math.hypot(kick.vx, kick.vz);
      const need = clamp(reach / 1.35, 22, 34);
      const scale = speed > 0.1 ? need / speed : 1.35;
      kickBall(this.ball, kick.vx * scale, kick.vz * scale, Math.max(kick.vy * 1.12, 5.6));
      this.stats.crosses += 1;
      this.incomingAerial = true;
      this.longPassLanding = { x: tx, z: tz };
      this.passTargetId = target?.id ?? null;
    } else if (kind === FootballState.FREE_KICK) {
      const userTake = !this.autoplay && taker.id === this.controlled.id;
      const fk = decideFreeKick({
        taker,
        ballX: this.ball.x,
        ballZ: this.ball.z,
        teammates: this.teamOf(taker).players,
        opponents: this.opponentsOf(taker),
      });
      if (decisionTelemetry.enabled) {
        decisionTelemetry.record({
          type: "FREE_KICK_DECISION",
          simulationTime: this.clock.elapsed,
          playerId: taker.id,
          teamId: taker.side,
          playerPosition: taker.slot,
          ballPosition: { x: this.ball.x, y: this.ball.y, z: this.ball.z },
          availableActions: ["SHOT", "CROSS", "PASS"],
          actionScores: {
            shot: fk.shotScore,
            cross: fk.crossScore,
            pass: fk.passScore,
          },
          chosenAction: intent.shoot ? "SHOT" : fk.action,
          relevantAttributes: {
            setPieces: taker.attrs.setPieces ?? taker.attrs.finishing,
            finishing: taker.attrs.finishing,
          },
          meta: { distGoal: fk.distGoal, nearBox: fk.nearBox },
        });
      }
      // Near-box SHOT must fire on auto-take — previously userTake fell through to a short pass.
      const userWantsDelivery =
        userTake && (intent.pass || intent.cross || intent.through || intent.passHold > 0.18);
      const shouldShoot = intent.shoot || (fk.action === "SHOT" && !userWantsDelivery);
      if (shouldShoot) {
        this.executeFreeKickShot(taker, intent, !userTake || this.autoplay);
        this.clearOwner();
        taker.kickTimer = 0.42;
        this.ball.lastTouchId = taker.id;
        this.ball.lastTouchSide = taker.side;
        this.assistCandidate = null;
        this.restartSpot = null;
        this.resumePlay();
        return;
      }
      const dir = this.aimDir(intent, taker);
      const wantCross = (!userTake && fk.action === "CROSS") || intent.cross;
      const passType: PassType = wantCross
        ? "cross"
        : intent.through
          ? "long"
          : intent.passHold > 0.55
            ? "long"
            : "short";
      let target: Player | null = null;
      if (wantCross) {
        target =
          this.teamOf(taker).players.find((p) => p.slot.includes("ST") || p.slot.includes("CF")) ??
          choosePassTarget(
            taker,
            this.teamOf(taker).players,
            this.opponentsOf(taker),
            this.ball,
            forward,
            -Math.sign(this.ball.z || 1) * 0.35,
            "cross",
          );
        const boxX = taker.oppGoalX() - taker.attackSign * 11;
        const boxZ = Math.sign(this.ball.z || 1) * 4.5;
        const tx = target ? target.x * 0.3 + boxX * 0.7 : boxX;
        const tz = target ? target.z * 0.35 + boxZ * 0.65 : boxZ;
        const kick = passKickVector(this.ball.x, this.ball.z, tx, tz, "cross");
        const setTech = stat01(taker.attrs.setPieces ?? taker.attrs.passing);
        const scatter = (1 - setTech) * 1.8;
        kickBall(
          this.ball,
          kick.vx + (Math.random() - 0.5) * scatter,
          kick.vz + (Math.random() - 0.5) * scatter,
          Math.max(kick.vy * 1.05, 4.8),
        );
        this.passTargetId = target?.id ?? null;
        this.longPassLanding = { x: tx, z: tz };
        this.stats.crosses += 1;
        this.incomingAerial = true;
      } else {
        target = choosePassTarget(
          taker,
          this.teamOf(taker).players,
          this.opponentsOf(taker),
          this.ball,
          dir.x || forward,
          dir.z,
          passType,
        );
        const tx = target?.x ?? taker.x + (dir.x || forward) * (passType === "long" ? 22 : 12);
        const tz = target?.z ?? taker.z + dir.z * 8;
        const kick = passKickVector(this.ball.x, this.ball.z, tx, tz, passType);
        // setPieces improves dead-ball delivery accuracy (not open-play passing).
        const setTech = stat01(taker.attrs.setPieces ?? taker.attrs.passing);
        const scatter = (1 - setTech) * 2.4;
        kickBall(this.ball, kick.vx + (Math.random() - 0.5) * scatter, kick.vz + (Math.random() - 0.5) * scatter, kick.vy);
        this.passTargetId = target?.id ?? null;
        this.longPassLanding = passType === "long" ? { x: tx, z: tz } : null;
        if (passType === "long") {
          this.stats.longPasses += 1;
          this.incomingAerial = true;
        }
      }
    } else if (kind === FootballState.PENALTY) {
      const goalX = taker.oppGoalX();
      const pen = stat01(taker.attrs.penalties ?? taker.attrs.finishing);
      const composure = stat01(taker.attrs.composure);
      // Prefer near-post / far-post aim — not a central smear across the whole goal.
      const sidePick = this.autoplay ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(this.aimDir(intent, taker).z || 1) || 1;
      const postBias = 2.55 + pen * 0.55;
      const aimScatter = (1.15 - pen * 0.75) * (1.05 - composure * 0.35);
      const aimZ = this.autoplay
        ? sidePick * postBias + (Math.random() - 0.5) * aimScatter
        : this.aimDir(intent, taker).z * 5.2;
      const dx = goalX - this.ball.x;
      const dz = aimZ - this.ball.z + (Math.random() - 0.5) * (1 - pen) * 1.15;
      const dist = Math.hypot(dx, dz) || 1;
      // Firm but not rocket-hot — better takers place; power alone shouldn't guarantee a parry.
      const power = 21.5 + pen * 3.2 + stat01(taker.attrs.shotPower) * 1.4 + composure * 0.8;
      kickBall(this.ball, (dx / dist) * power, (dz / dist) * power, 1.55 + (1 - pen) * 0.45);
      this.stats.shots += 1;
      this.incomingShot = true;
      this.incomingAerial = false;
      // Penalties: light aftertouch only (SWOS near/penalty = low spin).
      this.aftertouch = openAftertouch({
        kind: "shot",
        dirX: dx / dist,
        dirZ: dz / dist,
        technique: (taker.attrs.penalties ?? taker.attrs.finishing) * 0.7 + taker.attrs.composure * 0.3,
        strengthMul: this.tuning.aftertouchMultiplier * 0.35,
        aiSide: this.autoplay ? aiCurveSide(aimZ, this.ball.z) : null,
      });
    } else if (kind === FootballState.GOAL_KICK) {
      const dir = this.aimDir(intent, taker);
      const userTake = !this.autoplay && taker.id === this.controlled.id;
      const hold01 = userTake
        ? clamp(Math.max(intent.passHold / 1.1, intent.shootHold / 1.15), 0.12, 1)
        : clamp(0.42 + Math.random() * 0.5, 0.35, 0.95);
      // Shoot / through / charged pass → long toward strikers; soft tap → short build-up.
      const wantLong =
        intent.shoot ||
        intent.through ||
        intent.cross ||
        hold01 > 0.52 ||
        (!userTake && Math.random() < 0.62);
      const mates = this.teamOf(taker).players;
      const opps = this.opponentsOf(taker);
      let target: Player | null = null;
      if (wantLong) {
        target =
          chooseGoalKickLongTarget(taker, mates, dir.x || forward, dir.z) ??
          choosePassTarget(taker, mates, opps, this.ball, dir.x || forward, dir.z, "long", {
            style: "attack",
          });
      } else {
        target = choosePassTarget(taker, mates, opps, this.ball, dir.x || forward, dir.z, "short", {
          style: "buildup",
        });
      }
      const aim = goalKickAimPoint(taker, target, wantLong, dir.z);
      const tx = aim.x;
      const tz = clampInboundZ(aim.z, TOUCHLINE_SAFE_MARGIN + (wantLong ? 4 : 2));
      const delivery: PassType = wantLong || (target != null && taker.distTo(tx, tz) >= 28) ? "long" : "short";
      const kick = passKickVector(this.ball.x, this.ball.z, tx, tz, delivery);
      const reach = Math.max(1, Math.hypot(tx - this.ball.x, tz - this.ball.z));
      const scale = goalKickPowerScale(reach, wantLong || delivery === "long");
      const loft = wantLong || delivery === "long" ? Math.max(kick.vy * 1.08 * scale, 7.2) : kick.vy;
      kickBall(this.ball, kick.vx * scale, kick.vz * scale, loft);
      this.passTargetId = target?.id ?? null;
      this.longPassLanding = { x: tx, z: tz };
      if (delivery === "long") {
        this.stats.longPasses += 1;
        this.incomingAerial = true;
      } else {
        this.stats.shortPasses += 1;
        this.incomingAerial = false;
      }
      this.stats.passes += 1;
    } else {
      const target = choosePassTarget(taker, this.teamOf(taker).players, this.opponentsOf(taker), this.ball, forward, 0, "long");
      const aim = target ? keeperOutletAimPoint(target) : { x: taker.x + forward * 28, z: 0 };
      const tx = aim.x;
      const tz = clampInboundZ(aim.z, TOUCHLINE_SAFE_MARGIN + 2);
      const kick = passKickVector(this.ball.x, this.ball.z, tx, tz, "long");
      kickBall(this.ball, kick.vx, kick.vz, kick.vy);
      this.stats.longPasses += 1;
      this.incomingAerial = true;
      this.passTargetId = target?.id ?? null;
      this.longPassLanding = { x: tx, z: tz };
    }
    this.clearOwner();
    // Throw-ins use throwTimer / arms — don't flash a foot-kick pose.
    taker.kickTimer = kind === FootballState.THROW_IN ? 0 : 0.38;
    this.ball.lastTouchId = taker.id;
    this.ball.lastTouchSide = taker.side;
    this.pendingPassFrom = taker.id;
    this.assistCandidate = taker.id;
    this.restartSpot = null;
    this.resumePlay();
  }

  /** Direct free-kick shot — set-piece technique, charge power, and aim curl. */
  private executeFreeKickShot(taker: Player, intent: InputIntent, ai = false): void {
    const goalX = taker.oppGoalX();
    const setTech = stat01(taker.attrs.setPieces ?? taker.attrs.finishing);
    const hold01 = ai
      ? clamp(0.45 + setTech * 0.4 + Math.random() * 0.2, 0.35, 0.95)
      : clamp(intent.shootHold / 1.15, 0.2, 1);
    const aim = ai
      ? aimOnGoal((Math.random() - 0.5) * (1.1 - setTech * 0.55), 0.15 + Math.random() * 0.35, false)
      : aimOnGoal(intent.aimX, intent.aimY, this.invertShotY);
    const curl = ai ? (Math.random() - 0.5) * (1.8 - setTech) : intent.aimX * (2.4 - setTech * 1.1);
    const result = computeShot({
      distance: taker.distTo(goalX, 0),
      pressure: 0.08,
      bodyAlignment: 0.88 + setTech * 0.1,
      energy: taker.energy.value,
      attrs: taker.attrs,
      hold01,
      isHeader: false,
      shotKind: hold01 > 0.78 ? "power" : "normal",
      overcharged: false,
    });
    // Dead-ball accuracy leans on setPieces more than open-play finishing.
    const errScale = (1.15 - setTech * 0.55) * this.tuning.shotErrorMultiplier;
    result.dx *= errScale * 0.72;
    result.dy *= errScale * 0.85;
    const targetZ = aim.x + result.dx + curl;
    const targetY = aim.y + result.dy;
    const dx = goalX - this.ball.x;
    const dz = targetZ - this.ball.z;
    const dist = Math.hypot(dx, dz) || 1;
    const power =
      (18.5 + hold01 * 9 + stat01(taker.attrs.shotPower) * 3.5 + setTech * 2) * this.tuning.shotPowerMultiplier;
    const flightT = clamp(dist / Math.max(12, power * 0.7), 0.5, 1.45);
    const aimH = clamp(targetY, 0.4, 2.35);
    const lift = clamp(aimH / flightT + 0.5 * BALL_GRAVITY * flightT * 0.68, 3.4, 9.5);
    if (this.ball.y < 0.25) this.ball.y = 0.28;
    kickBall(this.ball, (dx / dist) * power, (dz / dist) * power, lift);
    this.shotTarget = null;
    this.shootCharge = 0;
    this.stats.shots += 1;
    this.incomingShot = true;
    const apexApprox = BALL_RADIUS + (lift * lift) / (2 * BALL_GRAVITY);
    this.incomingAerial = apexApprox >= 1.55;
    this.aftertouch = openAftertouch({
      kind: "shot",
      dirX: dx / dist,
      dirZ: dz / dist,
      technique: (taker.attrs.setPieces ?? taker.attrs.finishing) * 0.55 + taker.attrs.shooting * 0.25 + taker.attrs.composure * 0.2,
      strengthMul: this.tuning.aftertouchMultiplier * (ai ? 0.9 : 1.08),
      aiSide: ai ? aiCurveSide(targetZ, this.ball.z) : null,
    });
    this.events.emit("SHOT", { playerId: taker.id, power });
    this.stadium.crowd.setReaction("HOME", "cheer", 0.42);
    this.stadium.crowd.setReaction("AWAY", "cheer", 0.36);
  }

  private resumePlay(): void {
    this.restartElapsed = 0;
    this.restartSpot = null;
    this.restartPrep = null;
    this.ballState = "loose";
    this.state = this.autoplay ? FootballState.AUTOPLAY : FootballState.PLAYING;
  }

  private holdsAutoplayState(): boolean {
    return (
      this.state === FootballState.GOAL_CELEBRATION ||
      this.state === FootballState.FULL_TIME ||
      this.state === FootballState.PRE_MATCH ||
      this.state === FootballState.PAUSED ||
      this.state === FootballState.HALF_TIME ||
      this.state === FootballState.KICK_OFF ||
      this.state === FootballState.FREE_KICK ||
      this.state === FootballState.PENALTY ||
      isRestartState(this.state)
    );
  }

  private registerGoal(team: "home" | "away"): void {
    this.clearOffsidePhase();
    if (team === "home") this.homeScore += 1;
    else this.awayScore += 1;
    const scorer = this.playerById(this.ball.lastTouchId ?? this.controlled.id) ?? this.controlled;
    const ev = createGoalEvent({
      scoringTeam: team,
      scorerId: scorer.id,
      scorerName: scorer.displayName,
      scorerNumber: scorer.shirtNumber,
      assistId: this.assistCandidate && this.assistCandidate !== scorer.id ? this.assistCandidate : undefined,
      gameTime: this.clock.elapsed,
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      shotType: "open",
      venueId: this.stadium.record.id,
    });
    this.lastGoal = ev;
    this.goals.push(ev);
    if (this.practice === "spot") {
      this.clearOwner();
      this.spotResetT = 1.35;
      this.state = this.autoplay ? FootballState.AUTOPLAY : FootballState.PLAYING;
      return;
    }
    this.state = FootballState.GOAL_CELEBRATION;
    const userGoal = scorer.side === this.userSide && !this.autoplay;
    this.celebrationTime = userGoal ? USER_CELEBRATION_MAX : AI_CELEBRATION_SECONDS * this.tuning.celebrationDurationMultiplier;
    this.celebrationSteered = false;
    this.kickoffSide = team === "home" ? "away" : "home";
    const scorers = team === "home" ? this.home.players : this.away.players;
    const conceders = team === "home" ? this.away.players : this.home.players;
    this.celebrationRoutine = celebrateAI(scorer, scorers);
    concedeReaction(conceders);
    const levels = goalCrowdLevels(team);
    this.stadium.crowd.setReaction("HOME", team === "home" ? "cheer" : "down", levels.home);
    this.stadium.crowd.setReaction("AWAY", team === "away" ? "cheer" : "down", levels.away);
    this.events.emit("GOAL", { scoringTeam: team, scorerId: scorer.id });
    this.events.emit("CROWD_REACT", { section: team === "home" ? "HOME" : "AWAY", intensity: 1, mood: "cheer" });
    this.clearOwner();
  }

  private updateCelebration(dt: number, intent: InputIntent): void {
    this.celebrationTime -= dt;
    const scorer = this.lastGoal ? this.playerById(this.lastGoal.scorerId) : null;
    const target = scorer ? { x: scorer.runTargetX, z: scorer.runTargetZ } : null;
    const stay = celebrationStaysPut(this.celebrationRoutine);
    const userScorer = !!scorer && scorer.side === this.userSide && !this.autoplay;
    const moveEx = this.moveExtras();
    const arrived = !!(scorer && target && scorer.distTo(target.x, target.z) < 2.8);
    if (scorer && userScorer) {
      const steered = Math.hypot(intent.moveX, intent.moveZ) > 0.14;
      if (steered) this.celebrationSteered = true;
      if (this.celebrationSteered) {
        controlPlayer(scorer, intent, dt, 0, moveEx);
      } else if (target && !stay && !arrived) {
        movePlayer(scorer, dt, target.x - scorer.x, target.z - scorer.z, true, false, moveEx);
      } else {
        // Hold the pose at the celebration spot — do not cut to kick-off early.
        scorer.vx *= 0.55;
        scorer.vz *= 0.55;
      }
      if (intent.celebrateA || intent.pass) scorer.celebrationKind = "arms";
      if (intent.celebrateB || intent.shoot) scorer.celebrationKind = "slide";
      if (intent.celebrateX || intent.cross) scorer.celebrationKind = "jump";
      if (intent.celebrateY || intent.through) scorer.celebrationKind = "team";
      if ((arrived || stay) && !this.celebrationSteered) {
        scorer.vx = 0;
        scorer.vz = 0;
      }
    } else if (scorer && target && !stay && !arrived) {
      movePlayer(scorer, dt, target.x - scorer.x, target.z - scorer.z, true, false, moveEx);
    } else if (scorer) {
      // Arrived or stay-put: hold pose for the remaining celebration window.
      scorer.vx *= 0.5;
      scorer.vz *= 0.5;
    }
    for (const p of this.allPlayers()) {
      if (p.celebrating && scorer && p.id !== scorer.id) {
        const tx = stay || arrived ? p.desiredX : scorer.x * 0.65 + (target?.x ?? scorer.x) * 0.35;
        const tz = stay || arrived ? p.desiredZ : scorer.z * 0.65 + (target?.z ?? scorer.z) * 0.35;
        const dx = tx - p.x;
        const dz = tz - p.z;
        if (Math.hypot(dx, dz) > 2.2) movePlayer(p, dt, dx, dz, true, false, moveEx);
        else {
          p.vx *= 0.55;
          p.vz *= 0.55;
        }
      }
    }
    // Only skip (Enter/Space) or the safety timer ends the celebration — never arrival/still.
    if (this.celebrationTime <= 0 || intent.skip) {
      this.endCelebration();
    }
  }

  private endCelebration(): void {
    clearCelebration(this.allPlayers());
    this.stadium.crowd.setReaction("HOME", "idle", 0.25);
    this.stadium.crowd.setReaction("AWAY", "idle", 0.25);
    this.celebrationSteered = false;
    // Apply queued subs on the kick-off restart (not mid-celebration) so the
    // change and HUD card appear when play resumes.
    this.state = FootballState.KICK_OFF;
    this.tryFlushPendingSubs();
    this.resetKickoff(this.kickoffSide);
  }

  private resetKickoff(side: "home" | "away"): void {
    this.kickoffSide = side;
    this.home.resetKickoff(side === "home");
    this.away.resetKickoff(side === "away");
    this.ball.reset(0, 0);
    const kicker = (side === "home" ? this.home : this.away).players.find((p) => p.slot.includes("ST")) ?? this.home.players[10];
    this.ballState = "restart";
    this.takePossession(kicker);
    this.ballState = "owned";
    const preferred = this.allPlayers().find((p) => p.id === this.preferredPlayerId);
    if (preferred && preferred.side === this.userSide) this.controlled = preferred;
  }

  private followTeamControl(): void {
    if (this.possessing && this.possessing.side === this.userSide && !this.possessing.isGK) {
      this.controlled = this.possessing;
      return;
    }
    const possessingSide = this.possessing?.side ?? (this.ball.lastTouchSide as "home" | "away" | null) ?? null;
    this.controlled = autoSelectPlayer(this.allPlayers(), this.userSide, this.ball.x, this.ball.z, true, {
      possessingSide: this.possessing ? possessingSide : null,
      aerial: this.incomingAerial || this.ball.y > 1.25,
    });
  }

  private beginSecondHalf(): void {
    this.clock.startSecondHalf();
    this.endsFlipped = true;
    this.home.flipEnds();
    this.away.flipEnds();
    this.injuryAnnounced = false;
    this.periodWhistleGrace = 0;
    this.throwInOpen = false;
    this.throwInTakerId = null;
    for (const p of this.allPlayers()) p.energy.restoreHalfTime();
    this.tryFlushPendingSubs();
    this.resetKickoff(this.kickoffSide === "home" ? "away" : "home");
    this.state = FootballState.KICK_OFF;
    this.events.emit("KICKOFF", { kickingTeam: this.kickoffSide });
  }

  arrangeSetPiece(
    kind: SetPieceKind,
    takingSide: "home" | "away",
    ballX: number,
    ballZ: number,
    takerId?: string | null,
    soft = false,
  ): void {
    const taker = takerId ? this.playerById(takerId) : null;
    const script =
      kind === "CORNER" || kind === "FREE_KICK"
        ? chooseSetPieceScript(kind, ballZ, taker?.attrs.vision ?? 55)
        : undefined;
    applySetPieceShape(
      this.allPlayers(),
      {
        kind,
        takingSide,
        ballX,
        ballZ,
        takerId,
        endsFlipped: this.endsFlipped,
        script,
      },
      { soft },
    );
  }

  setupSpotKick(x: number, z: number): void {
    this.practice = "spot";
    this.clock.running = false;
    this.spotResetT = 0;
    const placed = resolveSpotKick(x, z, this.userSide);
    this.spotKick = placed;
    this.clearOwner();
    const taker = this.controlled;
    const dir = placed.goalDir;
    this.ball.reset(placed.ballX, placed.ballZ);
    taker.x = placed.ballX - dir * 1.15;
    taker.z = placed.ballZ;
    taker.vx = 0;
    taker.vz = 0;
    taker.facing = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (placed.kind === "PENALTY") {
      this.state = FootballState.PENALTY;
      this.arrangeSetPiece("PENALTY", this.userSide, placed.ballX, placed.ballZ, taker.id);
      const gk = dir > 0 ? this.away.gk() : this.home.gk();
      gk.x = dir * (HALF_LENGTH - 0.55);
      gk.z = 0;
      gk.vx = 0;
      gk.vz = 0;
      gk.facing = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      this.state = FootballState.FREE_KICK;
      this.arrangeSetPiece("FREE_KICK", this.userSide, placed.ballX, placed.ballZ, taker.id);
    }
    this.takePossession(taker);
    taker.firstTouchTimer = 0;
    this.ballState = "owned";
  }

  resetSpotKick(): void {
    const def = defaultSpotKick(this.userSide);
    this.setupSpotKick(def.x, def.z);
  }

  private spotHoldContext() {
    if (this.practice !== "spot" || !this.possessing || this.possessing.id !== this.controlled.id || !this.spotKick) return null;
    const kind: SetPieceKind = this.spotKick.kind === "PENALTY" ? "PENALTY" : "FREE_KICK";
    return {
      kind,
      takingSide: this.userSide,
      ballX: this.spotKick.ballX,
      ballZ: this.spotKick.ballZ,
      takerId: this.controlled.id,
      endsFlipped: this.endsFlipped,
    };
  }

  /** Keep defending GKs on their line for spot kicks / penalties until the ball is live. */
  private keeperSetPieceOpts(): {
    home: { holdLine?: boolean; setPieceHold?: boolean } | undefined;
    away: { holdLine?: boolean; setPieceHold?: boolean } | undefined;
  } {
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    const liveShot = speed > 6.5 && !this.ball.ownerId;
    if (this.state === FootballState.PENALTY || (this.practice === "spot" && this.spotKick?.kind === "PENALTY")) {
      if (liveShot) return { home: undefined, away: undefined };
      const takeSide =
        this.practice === "spot" ? this.userSide : this.possessing?.side ?? this.userSide;
      const defSide: "home" | "away" = takeSide === "home" ? "away" : "home";
      return {
        home: defSide === "home" ? { holdLine: true } : undefined,
        away: defSide === "away" ? { holdLine: true } : undefined,
      };
    }
    if (
      this.state === FootballState.FREE_KICK ||
      (this.practice === "spot" && this.spotKick && this.spotKick.kind !== "PENALTY")
    ) {
      if (liveShot) return { home: undefined, away: undefined };
      return {
        home: { setPieceHold: true },
        away: { setPieceHold: true },
      };
    }
    return { home: undefined, away: undefined };
  }

  private officialsPhase(): OfficialsPhase {
    if (this.practice === "spot") {
      return this.spotKick?.kind === "PENALTY" ? "penalty" : "spot";
    }
    if (this.state === FootballState.PENALTY) return "penalty";
    if (this.state === FootballState.FREE_KICK) return "free_kick";
    if (this.state === FootballState.GOAL_KICK) return "goal_kick";
    if (this.state === FootballState.CORNER) return "corner";
    if (this.state === FootballState.THROW_IN) return "throw_in";
    if (this.state === FootballState.KICK_OFF) return "kick_off";
    return "open";
  }

  private tickSpotKick(dt: number): void {
    if (this.possessing?.isGK && this.possessing.side !== this.userSide) this.spotResetT = Math.max(this.spotResetT, 0.9);
    if (this.spotResetT <= 0) return;
    this.spotResetT -= dt;
    if (this.spotResetT > 0) return;
    const spot = this.spotKick ?? resolveSpotKick(defaultSpotKick(this.userSide).x, defaultSpotKick(this.userSide).z, this.userSide);
    this.setupSpotKick(spot.ballX, spot.ballZ);
  }

  private teamOf(p: Player): Team {
    return p.side === "home" ? this.home : this.away;
  }

  private opponentsOf(p: Player): Player[] {
    return this.teamOf(p) === this.home ? this.away.players : this.home.players;
  }

  private syncVisuals(dt: number): void {
    this.ball.syncMesh();
    this.ball.setGoldRing(this.ballGoldRing);
    this.stadium.update(dt, this.camera.camera.position);
    this.officials.update(dt, this.ball.x, this.ball.z, this.officialsPhase());
    const focus = this.homeHudRing || this.awayHudRing
      ? hudFocusPlayers(this.possessing, this.allPlayers(), this.ball.x, this.ball.z, this.userSide)
      : { home: null, away: null };
    const homeColor = hexColor(this.home.record.primaryColor || "#ffffff");
    const awayColor = hexColor(this.away.record.primaryColor || "#ffdd55");
    for (const p of this.allPlayers()) {
      // Soft ball look — never override active run/jockey facing (MOVE beats BALL_IDLE).
      if (!p.celebrating && p.kickTimer <= 0 && !p.sliding) {
        const hints = [];
        if (this.passTargetId === p.id && !this.possessing) {
          const recv = receiveFacingHint(this.ball.vx, this.ball.vz);
          if (recv) hints.push(recv);
        }
        const steering = Math.hypot(p.vx, p.vz) > 0.45;
        if (steering) {
          hints.push(moveFacingHint(p.vx, p.vz));
        } else {
          const idle = idleBallFacingHint(p, this.ball.x, this.ball.z);
          if (idle) hints.push(idle);
        }
        if (hints.length) applyFacingHints(p, hints, dt);
      }
      updatePlayerAnimation(p, dt, this.time);
      setControlledMarker(p, p.id === this.controlled.id, p.side === "home" ? 0xffffff : 0xffdd55);
      const onHud =
        (p.side === "home" && this.homeHudRing && p.id === focus.home?.id) ||
        (p.side === "away" && this.awayHudRing && p.id === focus.away?.id);
      setHudMarker(p, onHud, p.side === "home" ? homeColor : awayColor);
      const onPassTarget =
        this.showPassTargetHighlight &&
        !!this.passTargetId &&
        p.id === this.passTargetId &&
        p.id !== this.controlled.id;
      setPassTargetMarker(p, onPassTarget);
      const hide = p.side === "home" ? this.homeHidePlayers : this.awayHidePlayers;
      const showPortrait =
        (p.side === "home" ? this.homeShowPortraits : this.awayShowPortraits) || hide;
      const opacity = p.side === "home" ? this.homePortraitOpacity : this.awayPortraitOpacity;
      const scale = p.side === "home" ? this.homePortraitScale : this.awayPortraitScale;
      const upright = p.side === "home" ? this.homePortraitUpright : this.awayPortraitUpright;
      let stack = portraitStackIndex(p);
      if (this.possessing?.id === p.id) stack += 400;
      if (p.id === this.controlled.id) stack += 800;
      setBodyVisible(p, !hide);
      setPortraitDecal(p, showPortrait, opacity ?? 0.85, upright ? "avatar" : "under", scale ?? 1, stack);
    }
  }

  private snapshotPoses(): void {
    this.ball.prevX = this.ball.x;
    this.ball.prevY = this.ball.y;
    this.ball.prevZ = this.ball.z;
    this.camera.snapshot();
    for (const p of this.allPlayers()) {
      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;
      p.prevFacing = p.facing;
    }
    for (const p of this.officials.players()) {
      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;
      p.prevFacing = p.facing;
    }
  }

  poseFrame(alpha: number): void {
    const t = clamp(alpha, 0, 1);
    this.camera.pose(t);
    this.ball.mesh.position.set(
      lerp(this.ball.prevX, this.ball.x, t),
      lerp(this.ball.prevY, this.ball.y, t) + BALL_RADIUS * (this.ball.visualScale - 1) * 0.5,
      lerp(this.ball.prevZ, this.ball.z, t),
    );
    this.ball.placeGoldRing(lerp(this.ball.prevX, this.ball.x, t), lerp(this.ball.prevZ, this.ball.z, t));
    for (const p of this.allPlayers()) {
      if (!p.mesh) continue;
      p.mesh.position.x = lerp(p.prevX, p.x, t);
      p.mesh.position.y = lerp(p.prevY, p.y, t);
      p.mesh.position.z = lerp(p.prevZ, p.z, t);
      p.mesh.rotation.y = lerpAngle(p.prevFacing, p.facing, t);
      // Re-apply after interpolated facing so flat/upright world orientation stays correct.
      const hide = p.side === "home" ? this.homeHidePlayers : this.awayHidePlayers;
      const showPortrait =
        (p.side === "home" ? this.homeShowPortraits : this.awayShowPortraits) || hide;
      const opacity = p.side === "home" ? this.homePortraitOpacity : this.awayPortraitOpacity;
      const scale = p.side === "home" ? this.homePortraitScale : this.awayPortraitScale;
      const upright = p.side === "home" ? this.homePortraitUpright : this.awayPortraitUpright;
      let stack = portraitStackIndex(p);
      if (this.possessing?.id === p.id) stack += 400;
      if (p.id === this.controlled.id) stack += 800;
      setPortraitDecal(p, showPortrait, opacity ?? 0.85, upright ? "avatar" : "under", scale ?? 1, stack);
    }
    for (const p of this.officials.players()) {
      if (!p.mesh) continue;
      p.mesh.position.x = lerp(p.prevX, p.x, t);
      p.mesh.position.y = lerp(p.prevY, p.y, t);
      p.mesh.position.z = lerp(p.prevZ, p.z, t);
      p.mesh.rotation.y = lerpAngle(p.prevFacing, p.facing, t);
    }
  }

  private drawScoreboard(): void {
    this.stadium.scoreboard.draw({
      homeAbbr: this.home.record.abbreviation,
      awayAbbr: this.away.record.abbreviation,
      homeName: this.home.record.name,
      awayName: this.away.record.name,
      home: this.homeScore,
      away: this.awayScore,
      clock: this.clock.display(),
      state: this.state,
      scorer: this.state === FootballState.GOAL_CELEBRATION ? this.lastGoal?.scorerName : undefined,
      scorerNumber: this.state === FootballState.GOAL_CELEBRATION ? this.lastGoal?.scorerNumber : undefined,
      homeColor: this.home.record.primaryColor,
      awayColor: this.away.record.primaryColor,
    });
  }

  private updatePassDebug(): void {
    const show = this.showPassDebug;
    if (show && this.possessing && this.passVector) {
      this.passDebugLine.visible = true;
      const p = this.possessing;
      this.passDebugLine.geometry.setFromPoints([
        new THREE.Vector3(p.x, 0.35, p.z),
        new THREE.Vector3(p.x + this.passVector.x * 14, 0.35, p.z + this.passVector.z * 14),
      ]);
    } else {
      this.passDebugLine.visible = false;
    }
    if (show && this.longPassLanding) {
      this.landMarker.visible = true;
      this.landMarker.position.set(this.longPassLanding.x, 0.04, this.longPassLanding.z);
    } else {
      this.landMarker.visible = false;
    }
  }

  private updateShotMarker(intent: InputIntent): void {
    if (!intent.shootHeld || !this.possessing) {
      this.shotMarker.visible = false;
      return;
    }
    const aim = aimOnGoal(intent.aimX, intent.aimY, this.invertShotY);
    const goalX = this.possessing.oppGoalX();
    this.shotMarker.visible = true;
    this.shotMarker.position.set(goalX, aim.y, aim.x);
    this.shotMarker.rotation.y = this.possessing.attackSign > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  dispose(): void {
    this.scene.remove(this.sceneRoot);
    this.scene.remove(this.stadium.group);
  }
}
