// The building blocks every cosmetic is assembled from. The runtime
// (client/src/character/*, weapons/skins.ts) implements EVERY id here, so
// an item is never a label — it is a recipe the engine can perform.
//
// Adding a new move/effect/prop/pattern/shape here + its runtime handler
// unlocks thousands more items without touching the shop.

export const MOVES = [
  'idle', 'point', 'nod', 'fistpump', 'handsup', 'shoulders', 'wave', 'jump',
  'raise', 'pose', 'walk', 'dance1', 'dance2', 'clap', 'sidestep', 'flex',
  'spin', 'chesttap', 'airpunch', 'bow', 'salute', 'sit', 'kneel', 'shuffle',
  'moonwalk', 'backflip', 'crouchpose', 'headbang', 'twirl', 'armswing',
  'stomp', 'lookaround', 'shrug', 'laugh', 'facepalm', 'thumbsup', 'yawn',
  'stretch', 'think', 'taunt', 'cheer', 'march', 'robot', 'wiggle', 'leap',
  'landslam', 'crossarms', 'hipsway', 'punchcombo', 'kick', 'spinjump',
  'slide', 'heelclick', 'pray', 'meditate', 'wallpush', 'sweep', 'conduct',
  'drum', 'strum', 'sing', 'juggle', 'freeze', 'levitate', 'collapse',
] as const
export type MoveId = (typeof MOVES)[number]

export const EFFECTS = [
  'none', 'sparks', 'confetti', 'fireworks', 'ring', 'beam', 'hologram',
  'lightning', 'shadow', 'stars', 'snow', 'flames', 'glitch', 'portal',
  'crown', 'spotlight', 'smoke', 'petals', 'bubbles', 'rain', 'aurora',
  'orbitals', 'shockwave', 'fracture', 'rewind', 'vanish', 'throne', 'giant',
  'nova', 'void', 'frost', 'embers', 'pulse', 'glow', 'trail', 'lasers',
  'coins', 'feathers', 'leaves', 'discoball', 'runes', 'eclipse', 'tornado',
  'meteor', 'wormhole', 'timefreeze', 'mirrorworld', 'galaxy', 'clones',
] as const
export type EffectId = (typeof EFFECTS)[number]

export const PROPS = [
  'none', 'trophy', 'flag', 'mic', 'guitar', 'drink', 'chair', 'sign',
  'umbrella', 'ball', 'crown', 'sword', 'hammer', 'banner', 'scepter',
  'lantern', 'drone', 'boombox', 'cape', 'wings', 'skateboard', 'flare',
  'book', 'phone', 'mirror', 'throne', 'podium', 'pillow', 'telescope',
  'paintbrush', 'wrench', 'cable', 'fusebox', 'generator', 'pylon',
  'medal', 'belt', 'crate', 'balloon', 'kite', 'torch', 'shield', 'staff',
  'hourglass', 'compass', 'globe',
] as const
export type PropId = (typeof PROPS)[number]

export const CAMERAS = ['static', 'orbit', 'zoom', 'dramatic', 'lowangle', 'crane', 'shake', 'dolly'] as const
export type CameraId = (typeof CAMERAS)[number]

export const PATTERNS = [
  'solid', 'camo', 'stripes', 'hex', 'circuit', 'scales', 'cracks', 'waves',
  'stars', 'digital', 'marble', 'carbon', 'tiger', 'splatter', 'grid',
  'runes', 'flames', 'frost', 'leaves', 'ripples', 'gears', 'chevrons',
  'constellation', 'veins', 'checker', 'dots', 'zigzag', 'tribal', 'lattice',
  'topo', 'static', 'plaid', 'spiral', 'eyes', 'bones', 'clouds', 'feathers',
  'scratches', 'rivets', 'weave',
] as const
export type PatternId = (typeof PATTERNS)[number]

export const FINISHES = ['matte', 'gloss', 'metal', 'holo', 'chrome', 'satin', 'rough', 'glass'] as const
export type FinishId = (typeof FINISHES)[number]

export const EMISSIVES = ['none', 'pulse', 'scroll', 'flicker', 'rainbow', 'breathe', 'strobe', 'wave', 'heartbeat'] as const
export type EmissiveId = (typeof EMISSIVES)[number]

export const PARTICLES = [
  'none', 'embers', 'frost', 'sparks', 'void', 'stars', 'glitch', 'leaves',
  'bubbles', 'petals', 'smoke', 'lightning', 'confetti', 'coins', 'dust',
  'orbs', 'feathers', 'notes', 'hearts', 'skulls', 'snow', 'rain', 'fireflies',
] as const
export type ParticleId = (typeof PARTICLES)[number]

export const SLOTS = ['head', 'face', 'back', 'shoulder', 'wrist', 'neck', 'waist', 'float', 'aura', 'pet'] as const
export type SlotId = (typeof SLOTS)[number]

export const SHAPES = [
  // head
  'cap', 'beanie', 'helmet', 'crown', 'halo', 'horns', 'antenna', 'hood',
  'bandana', 'headphones', 'mohawk', 'tiara', 'tophat', 'cowboyhat', 'beret',
  'headband', 'flame_crown', 'bucket', 'wizardhat', 'crownspikes',
  // face
  'glasses', 'visor', 'mask', 'goggles', 'monocle', 'respirator', 'facepaint',
  'eyepatch', 'muzzle', 'blindfold',
  // back
  'wings', 'backpack', 'jetpack', 'quiver', 'sword_back', 'shield', 'cape',
  'banner_back', 'tank', 'rocket', 'surfboard', 'scroll', 'coffin', 'turbine',
  // shoulder
  'pauldron', 'spikes', 'parrot', 'epaulette', 'lantern_shoulder', 'cannon',
  // wrist
  'bracelet', 'watch', 'gauntlet', 'wristband', 'cuff', 'hologram_wrist',
  // neck
  'chain', 'scarf', 'collar', 'bowtie', 'tie', 'medallion', 'ruff',
  // waist
  'belt', 'pouch', 'holster', 'sash', 'tail', 'keyring',
  // float
  'orb', 'drone', 'satellite', 'cube_orbit', 'ring_orbit', 'balloon',
  'umbrella_float', 'book_float', 'lantern_float', 'crystal', 'eye', 'planet',
  // aura
  'aura_ring', 'aura_particles', 'aura_shadow', 'aura_flame', 'aura_frost',
  'aura_lightning', 'aura_void', 'aura_stars',
  // pet
  'ghost', 'cat', 'bird', 'skull', 'bot', 'slime', 'moth', 'fox', 'owl',
  'dragon', 'jelly', 'crab',
] as const
export type ShapeId = (typeof SHAPES)[number]

export const MOTIONS = ['none', 'bob', 'spin', 'orbit', 'pulse', 'flap', 'hover', 'sway', 'wobble', 'blink'] as const
export type MotionId = (typeof MOTIONS)[number]
