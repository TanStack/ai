/** Convert Celsius to Fahrenheit. */
const celsiusToFahrenheit = (celsius) => {
  return celsius * (9 / 5) + 32
}

/** Convert Fahrenheit to Celsius. */
const fahrenheitToCelsius = (fahrenheit) => {
  // BUG: should subtract 32 before scaling, not after.
  return fahrenheit * (5 / 9) - 32
}

export { celsiusToFahrenheit, fahrenheitToCelsius }
