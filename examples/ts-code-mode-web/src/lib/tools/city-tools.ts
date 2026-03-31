import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

interface CitySummary {
  name: string
  country: string
  populationMillions: number
}

interface CityDetails extends CitySummary {
  climate: string
  landmarks: Array<string>
  cuisine: Array<string>
  funFacts: Array<string>
}

const CITIES: Array<CityDetails> = [
  {
    name: 'Tokyo',
    country: 'Japan',
    populationMillions: 37.4,
    climate: 'Humid subtropical with warm summers and mild winters',
    landmarks: ['Shibuya Crossing', 'Senso-ji Temple', 'Tokyo Skytree'],
    cuisine: ['Sushi', 'Ramen', 'Monjayaki'],
    funFacts: [
      "Tokyo has the world's busiest train stations.",
      'It hosts more Michelin-starred restaurants than any other city.',
    ],
  },
  {
    name: 'Paris',
    country: 'France',
    populationMillions: 11.0,
    climate: 'Oceanic climate with cool winters and mild summers',
    landmarks: ['Eiffel Tower', 'Louvre Museum', 'Notre-Dame Cathedral'],
    cuisine: ['Croissants', 'Coq au vin', 'Macarons'],
    funFacts: [
      'Paris has over 400 parks and gardens.',
      'The Louvre is the most visited museum in the world.',
    ],
  },
  {
    name: 'New York City',
    country: 'United States',
    populationMillions: 19.6,
    climate: 'Humid continental with hot summers and cold winters',
    landmarks: ['Statue of Liberty', 'Central Park', 'Times Square'],
    cuisine: ['Bagels', 'Pizza', 'Cheesecake'],
    funFacts: [
      'NYC has over 800 languages spoken across its boroughs.',
      'Central Park is larger than the principality of Monaco.',
    ],
  },
  {
    name: 'Barcelona',
    country: 'Spain',
    populationMillions: 5.7,
    climate: 'Mediterranean with warm summers and mild winters',
    landmarks: ['Sagrada Familia', 'Park Guell', 'La Rambla'],
    cuisine: ['Paella', 'Patatas bravas', 'Crema catalana'],
    funFacts: [
      'Barcelona has 9 UNESCO World Heritage sites.',
      'The city has over 4 km of beaches within city limits.',
    ],
  },
  {
    name: 'Singapore',
    country: 'Singapore',
    populationMillions: 5.9,
    climate: 'Tropical rainforest climate, warm and humid year-round',
    landmarks: ['Marina Bay Sands', 'Gardens by the Bay', 'Merlion Park'],
    cuisine: ['Hainanese chicken rice', 'Laksa', 'Chili crab'],
    funFacts: [
      "Singapore has one of the world's best airport transit systems.",
      'It is often called a city in a garden.',
    ],
  },
  {
    name: 'Cape Town',
    country: 'South Africa',
    populationMillions: 4.7,
    climate: 'Mediterranean with warm dry summers and cool wet winters',
    landmarks: ['Table Mountain', 'Robben Island', 'Cape Point'],
    cuisine: ['Bobotie', 'Bunny chow', 'Malva pudding'],
    funFacts: [
      'Cape Town sits between ocean and mountains.',
      'Table Mountain is one of the oldest mountains on Earth.',
    ],
  },
]

function normalizeCityName(name: string) {
  return name.trim().toLowerCase()
}

export const listCitiesTool = toolDefinition({
  name: 'listCities',
  description:
    'List available cities with country and population in millions for analysis.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    cities: z.array(
      z.object({
        name: z.string(),
        country: z.string(),
        populationMillions: z.number(),
      }),
    ),
    total: z.number(),
  }),
}).server(() => {
  const cities: Array<CitySummary> = CITIES.map((city) => ({
    name: city.name,
    country: city.country,
    populationMillions: city.populationMillions,
  }))

  return {
    cities,
    total: cities.length,
  }
})

export const getCityDetailsTool = toolDefinition({
  name: 'getCityDetails',
  description:
    'Get detailed city information such as climate, landmarks, cuisine, and fun facts.',
  inputSchema: z.object({
    cityName: z.string().describe('City name to look up'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    city: z
      .object({
        name: z.string(),
        country: z.string(),
        populationMillions: z.number(),
        climate: z.string(),
        landmarks: z.array(z.string()),
        cuisine: z.array(z.string()),
        funFacts: z.array(z.string()),
      })
      .nullable(),
  }),
}).server(({ cityName }) => {
  const city = CITIES.find(
    (entry) => normalizeCityName(entry.name) === normalizeCityName(cityName),
  )

  return {
    found: Boolean(city),
    city: city ?? null,
  }
})

export const compareCitiesTool = toolDefinition({
  name: 'compareCities',
  description:
    'Compare two cities by population, climate, and tourism highlights.',
  inputSchema: z.object({
    firstCity: z.string().describe('First city name'),
    secondCity: z.string().describe('Second city name'),
  }),
  outputSchema: z.object({
    foundBoth: z.boolean(),
    comparison: z
      .object({
        firstCity: z.object({
          name: z.string(),
          country: z.string(),
          populationMillions: z.number(),
        }),
        secondCity: z.object({
          name: z.string(),
          country: z.string(),
          populationMillions: z.number(),
        }),
        populationDifferenceMillions: z.number(),
        climateSummary: z.string(),
        travelHighlights: z.array(z.string()),
      })
      .nullable(),
    missingCities: z.array(z.string()),
  }),
}).server(({ firstCity, secondCity }) => {
  const first = CITIES.find(
    (entry) => normalizeCityName(entry.name) === normalizeCityName(firstCity),
  )
  const second = CITIES.find(
    (entry) => normalizeCityName(entry.name) === normalizeCityName(secondCity),
  )

  const missingCities: Array<string> = []
  if (!first) missingCities.push(firstCity)
  if (!second) missingCities.push(secondCity)

  if (!first || !second) {
    return {
      foundBoth: false,
      comparison: null,
      missingCities,
    }
  }

  return {
    foundBoth: true,
    comparison: {
      firstCity: {
        name: first.name,
        country: first.country,
        populationMillions: first.populationMillions,
      },
      secondCity: {
        name: second.name,
        country: second.country,
        populationMillions: second.populationMillions,
      },
      populationDifferenceMillions: Math.abs(
        first.populationMillions - second.populationMillions,
      ),
      climateSummary: `${first.name}: ${first.climate}. ${second.name}: ${second.climate}.`,
      travelHighlights: [
        `${first.name}: ${first.landmarks[0]}`,
        `${second.name}: ${second.landmarks[0]}`,
      ],
    },
    missingCities: [],
  }
})

export const cityTools = [listCitiesTool, getCityDetailsTool, compareCitiesTool]
