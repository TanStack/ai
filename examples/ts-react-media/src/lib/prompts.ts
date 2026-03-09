// Photo-realistic prompts with lens specifications for fal.ai models

export const IMAGE_PROMPTS = [
  // Action/Sports
  'Professional motorsport photograph of a rally car mid-drift on a gravel mountain stage, dust cloud frozen in motion, driver visible through windshield, shot on Canon EOS R3 with 70-200mm f/2.8 at 1/2000s, golden hour backlighting',
  'Explosive action shot of a stuntwoman leaping through a glass window, shards suspended around her, practical pyrotechnics in background, photographed with Sony A1 and 24-70mm f/2.8 GM at 1/4000s, high-speed sync flash',
  'MMA fighter throwing a spinning back kick in the octagon, sweat droplets frozen mid-air, intense concentration on face, shot on Nikon Z9 with 85mm f/1.4 at 1/3200s, dramatic rim lighting',
  'Parkour athlete mid-backflip between rooftops at sunset, city skyline behind, clothes rippling in wind, Canon 5D Mark IV with 35mm f/1.4L at 1/2500s, natural golden hour light',

  // Portrait/Fashion
  'Editorial fashion portrait of a woman in a crimson silk gown on a windswept cliff, fabric billowing dramatically, stormy ocean backdrop, Phase One IQ4 with 110mm f/2.8 lens, overcast diffused lighting',
  'Intimate boudoir photograph, woman wrapped in sheer white linen on unmade bed, morning sunlight streaming through venetian blinds creating shadow patterns on skin, Leica SL2 with 50mm Summilux f/1.4, natural window light',
  'High-fashion beauty shot, model with slicked wet hair and glistening skin, water droplets on face and shoulders, studio shot on Hasselblad H6D with 100mm f/2.2 and Profoto beauty dish',
  'Noir-style portrait of a jazz singer at a vintage microphone, cigarette smoke curling, red lipstick, sequined dress catching spotlight, shot on Fuji GFX 100S with 80mm f/1.7, single spotlight with haze',

  // Cinematic/Documentary
  'War correspondent photograph of special forces operator in full tactical gear during night operation, NVG goggles raised, face lit by distant explosion, Sony A7S III with 35mm f/1.4 at ISO 12800, available light only',
  'Behind-the-scenes film set photograph, actress in period costume between takes, crew and lighting equipment visible, depth of field isolating subject, Leica M11 with 75mm Summilux f/1.4',
  'Street photography of a mysterious woman in a rain-soaked Tokyo alley, neon signs reflected in puddles, steam rising from vents, Ricoh GR III at f/2.8, high contrast black and white with selective color',

  // Nature/Adventure
  'National Geographic style photograph of a female free diver descending into a cenote, sunbeams piercing crystal blue water, ancient rock formations, Nikon Z8 in Nauticam housing with 14-24mm f/2.8 at f/8',
  'Expedition photograph of a mountaineer on knife-edge ridge at dawn, dramatic drop on both sides, distant peaks catching first light, Fuji X-T5 with 16-55mm f/2.8 at f/11, HDR composite',
  'Wildlife photograph of a lioness mid-pounce during hunt, muscles tensed, dust kicked up, prey blurred in background, Canon EOS R5 with 600mm f/4L at 1/3200s, Serengeti golden grass',

  // Glamour/Lifestyle
  'Yacht lifestyle photograph, sun-kissed woman in white bikini diving into Mediterranean waters, villa-dotted coastline behind, water splash frozen, Sony A7 IV with 24mm f/1.4 GM at 1/8000s',
  'Fitness editorial of athletic woman performing yoga pose on volcanic black sand beach at sunrise, steam rising from hot springs, toned physique silhouetted, Canon R6 with 85mm f/1.2L',
  'Luxury automotive advertisement, woman in designer dress stepping out of vintage Ferrari on Monaco harbor, superyachts in background, Hasselblad X2D with 90mm f/2.5 at golden hour',
  'Pool party photograph, group of friends laughing and splashing, champagne spray catching sunlight, summer villa setting, shot underwater and above with dual camera rig, Sony A7R V with 20mm f/1.8',

  // Atmospheric/Moody
  'Rain-soaked urban photograph of a woman running across empty Times Square at 3am, umbrella abandoned, mascara running, taxi headlights creating lens flares, Leica Q3 at f/1.7 wide open',
  'Abandoned industrial photograph, model in couture gown exploring derelict factory, dust particles in light shafts, decay and beauty contrast, Canon 1DX III with tilt-shift 45mm f/2.8',
] as const

export const VIDEO_PROMPTS = {
  textToVideo: [
    // Action sequences - cinematic realism
    'Cinematic car commercial: Porsche 911 GT3 powerslides around mountain hairpin, camera on helicopter gimbal tracking alongside, gravel spraying, golden hour light flaring through dust, shot on RED V-Raptor 8K with Angenieux Optimo zoom',
    'Professional fight choreography: Two MMA fighters exchanging combinations in slow motion, sweat flying, muscles rippling, octagon lights creating rim lighting, phantom high-speed camera at 1000fps',
    'Extreme sports documentary: Wingsuit pilot launches from cliff edge, spreads arms, terrain rushing below at 150mph, POV and chase drone perspectives intercut, GoPro Hero 12 and FPV drone footage',
    'Motorcycle commercial: Ducati Panigale weaving through Monaco streets at dawn, lean angles catching golden light on fairings, reflections in shop windows, shot on Arri Alexa Mini with anamorphic glass',

    // Atmospheric/Documentary
    'Nature documentary: Thunderstorm cell rolling across Great Plains at sunset, supercell structure illuminated by internal lightning, time-lapse clouds morphing, shot on RED Komodo with 50-500mm cinema zoom',
    'Macro cinematography: Single water droplet falls in extreme slow motion, impacts still pool, crown splash forms perfectly, ripples expand outward, Phantom Flex4K at 5000fps with macro probe lens',
    'Travel documentary: Aurora borealis dancing over Icelandic glacier lagoon, icebergs reflecting green light, stars wheeling above, Sony FX6 with 14mm f/1.8 on motorized timelapse dolly',
    'Fashion film: Supermodel walks Paris runway, haute couture gown flowing, strobes firing in sequence, slow motion fabric movement, multiple angle coverage on Arri Alexa 35',
  ],
  imageToVideo: [
    // Subtle realistic animation
    'Gentle breeze animation: hair strands lift and fall naturally, fabric ripples softly, chest rises and falls with breathing, dust motes drift through sunbeam',
    'Portrait animation: slow push-in on face, subject blinks naturally twice, slight head turn toward camera, ambient light subtly shifts',
    'Cinematic orbit: camera slowly circles subject at 15 degrees, parallax reveals depth, bokeh shifts in background, volumetric haze catches light',
    'Action burst: subject explodes into motion, hair and clothing react to momentum, environment responds with particle displacement',
    'Dolly parallax: camera tracks laterally, foreground and background separate dimensionally, subject remains sharp, shallow depth of field maintained',
    'Weather transition: rain begins falling, droplets land on skin and surfaces, reflections form in pooling water, mood shifts darker',
    'Practical fire effect: flames flicker and dance realistically, ember particles rise, warm light plays across subject, smoke wisps drift',
    'Dynamic action: subject performs athletic movement, muscles engage visibly, hair whips with motion, impact creates environmental reaction',
  ],
} as const

export type ImagePrompt = (typeof IMAGE_PROMPTS)[number]
export type VideoPrompt =
  | (typeof VIDEO_PROMPTS.textToVideo)[number]
  | (typeof VIDEO_PROMPTS.imageToVideo)[number]

export function getRandomImagePrompt(): string {
  return IMAGE_PROMPTS[Math.floor(Math.random() * IMAGE_PROMPTS.length)] ?? ''
}

export function getRandomVideoPrompt(
  mode: 'text-to-video' | 'image-to-video',
): string {
  const prompts =
    mode === 'text-to-video'
      ? VIDEO_PROMPTS.textToVideo
      : VIDEO_PROMPTS.imageToVideo
  return prompts[Math.floor(Math.random() * prompts.length)] ?? ''
}
