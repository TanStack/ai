function Brand() {
  return (
    <h1 className="font-black flex gap-x-3 gap-y-0 text-5xl md:text-6xl lg:text-7xl xl:text-8xl uppercase [letter-spacing:-.05em] flex-wrap justify-center leading-none">
      TanStack
      <span className="text-transparent bg-clip-text bg-linear-to-r from-pink-500 to-pink-700 relative">
        AI
        <span className="absolute bottom-0 -right-1 translate-y-full [letter-spacing:0] text-sm md:text-base font-black lg:text-lg align-super text-background animate-bounce uppercase bg-foreground shadow-black/30 px-2 py-1 rounded-md leading-none whitespace-nowrap">
          DEMO
        </span>
      </span>
    </h1>
  )
}

export default Brand
