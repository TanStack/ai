import Brand from './Brand'
import Search from './Search'
import ProjectDescription from './ProjectDescription'

function HeroSection() {
  return (
    <section className="py-20 px-6 max-w-5xl mx-auto space-y-8">
      <Brand />
      <ProjectDescription />
      <Search />
    </section>
  )
}

export default HeroSection
