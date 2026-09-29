// Gameplay + physics tuning. World units: 1 u = 1 "page pixel" of the 1280×720 level.

export const W = 1280;
export const H = 720;

/** Fixed simulation step (seconds). */
export const DT = 1 / 120;

// Wick
export const WICK_R = 16;
export const WALK_SPEED = 118;
export const GRAVITY = 1500;
export const TERMINAL_VY = 1050;
/** Walkable surfaces have normal.y below this (normal pointing up enough). cos(58°) ≈ 0.53 */
export const GROUND_NY = -0.53;
/** Comet ink can carry Wick on steeper surfaces: cos(72°) ≈ 0.31 */
export const RUSH_GROUND_NY = -0.31;
/** Contacts with |n.x| above this, facing into them, turn Wick around. */
export const WALL_NX = 0.55;
export const TURN_COOLDOWN = 0.18;
export const GROUND_SNAP = 10;
/** Ground accel/decel toward target tangential speed (u/s²). */
export const GROUND_ACCEL = 900;
export const GROUND_DECEL = 700;
/** Hazards are forgiving: the effective body radius against hazards is smaller. */
export const HAZARD_GRACE = 3;
export const FALL_DEATH_Y = H + 60;
export const STUCK_TIME = 2.5;
export const STUCK_DIST = 4;
export const SPARK_PICK_R = WICK_R + 16;
export const GOAL_R = 34;

// Inks
export const INK_HW = 4;
export const BOUNCE_SPEED = 820;
export const RUSH_SPEED = 430;
export const RUSH_ACCEL = 2600;
/** After a bounce / fast launch, ground-snapping is suppressed for this long. */
export const LAUNCH_NO_SNAP = 0.14;

// Drawing
export const PEN_SAMPLE = 5;
export const MIN_STROKE = 8;
export const WICK_EXCLUSION = WICK_R + INK_HW + 6;
export const SIM_SIMPLIFY_EPS = 1.2;

/** A run that goes longer than this (sim seconds) is considered failed by the headless verifier. */
export const MAX_RUN_TIME = 90;
