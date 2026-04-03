export interface Guitar {
  id: number
  name: string
  description: string
  shortDescription: string
  price: number
}

const guitars: Array<Guitar> = [
  {
    id: 1,
    name: 'Fender Stratocaster',
    description:
      'A versatile electric guitar known for its bright, clear tone and comfortable playability. Perfect for blues, rock, and everything in between.',
    shortDescription: 'Versatile electric guitar with bright, clear tone.',
    price: 1299,
  },
  {
    id: 2,
    name: 'Gibson Les Paul',
    description:
      'A classic electric guitar with a warm, thick tone. The mahogany body and humbucker pickups deliver powerful sustain and rich harmonics.',
    shortDescription: 'Classic electric guitar with warm, thick tone.',
    price: 2499,
  },
  {
    id: 3,
    name: 'Taylor 814ce',
    description:
      'A premium acoustic-electric guitar with exceptional clarity and projection. The Grand Auditorium body shape is comfortable and versatile.',
    shortDescription: 'Premium acoustic-electric with exceptional clarity.',
    price: 3299,
  },
  {
    id: 4,
    name: 'Martin D-28',
    description:
      'The quintessential dreadnought acoustic guitar. Rich bass, clear trebles, and incredible volume make it a legend among flat-top guitars.',
    shortDescription: 'Legendary dreadnought acoustic with rich bass.',
    price: 2999,
  },
]

export default guitars
