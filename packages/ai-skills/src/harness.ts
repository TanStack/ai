import { existsSync, watch } from 'node:fs'
import { basename, dirname } from 'node:path'
import { firstSentence } from '@tanstack/ai'
import { defineCommand, definePlugin } from '@tanstack/ai-harness'
import { renderCatalog } from './catalog'
import { estimateTokens, withSkills } from './middleware'
import { skillDirectory } from './node'
import type { FSWatcher } from 'node:fs'
import type { AnyChatMiddleware } from '@tanstack/ai'
import type { SkillsOptions } from './middleware'
import type { ModelFamily, SkillMetadata, SkillSource } from './types'

export interface SkillsPluginOptions extends SkillsOptions {
  /**
   * The skill folders. Each folder holds skill folders with a `SKILL.md`.
   * When two folders have a skill with the same name, the first folder wins.
   * A folder that does not exist yet is used once it exists.
   */
  dirs: ReadonlyArray<string>
  /**
   * Names that a UI handles itself, for example its own `/help`. A skill
   * with one of these names gets the command `/skill:<name>`.
   */
  reserved?: ReadonlyArray<string>
}

/** A skill, and the folder it comes from. */
interface FoundSkill {
  skill: SkillMetadata
  dir: string
}

/**
 * The skills of `dirs`, by name, in folder order. The first folder wins a
 * name. A folder that is missing or cannot be read gives no skills, and a
 * broken `SKILL.md` is left out.
 */
async function scan(dirs: ReadonlyArray<string>) {
  const found = new Map<string, FoundSkill>()
  for (const dir of dirs) {
    // A folder that throws, at once or later, gives no skills.
    const listed = await Promise.resolve()
      .then(() => skillDirectory(dir, { strict: false }).list())
      .catch(() => [])
    for (const skill of listed) {
      if (!found.has(skill.name)) found.set(skill.name, { skill, dir })
    }
  }
  return found
}

/** The catalog with only the first sentence of each description. */
function shortCatalog(listed: Array<SkillMetadata>, family: ModelFamily) {
  return renderCatalog(
    listed.map((skill) => ({
      ...skill,
      description: firstSentence(skill.description),
    })),
    family,
  )
}

/** The text of the turn that `/<name> [task]` starts. */
function skillPrompt(name: string, input: unknown) {
  const task = typeof input === 'string' ? input.trim() : ''
  return task === ''
    ? `Use the ${name} skill.`
    : `Use the ${name} skill: ${task}`
}

/**
 * A harness plugin that gives the model the skills of `dirs`, and makes each
 * skill a command: `/<name> [task]` starts a turn that tells the model to use
 * the skill. A skill whose name another command has is `/skill:<name>`.
 * `/skills` lists every skill, its folder, and its command.
 *
 * The plugin watches the folders, and it lists them again at the start of
 * each turn. A skill that you add, change, or remove while the session runs
 * changes the commands at once, with no restart.
 *
 * The model's skill list has one line for each skill: its name and the first
 * sentence of its description. When the list is longer than
 * `maxCatalogTokens`, the skills of the earlier folders stay in it, and a
 * skill that you called with its command always stays.
 *
 * @param options.dirs - The skill folders, the first one wins on a name.
 * @param options.reserved - Command names a UI handles itself.
 *
 * @example
 * ```ts
 * import { homedir } from 'node:os'
 * import { join } from 'node:path'
 * import { skills } from '@tanstack/ai-skills/harness'
 *
 * defineHarness({
 *   name: 'acme/agent',
 *   adapter,
 *   plugins: () => [
 *     skills({ dirs: ['./.agents/skills', join(homedir(), '.acme', 'skills')] }),
 *   ],
 * })
 * ```
 */
export function skills(options: SkillsPluginOptions) {
  const { dirs, reserved = [], ...skillsOptions } = options
  // `skills` is this plugin's own command, so a skill named `skills` gets
  // the prefix too.
  const taken = new Set(['skills', ...reserved])

  return definePlugin({
    name: 'tanstack/skills',
    setup: async (ctx) => {
      // The skill commands of this plugin: command name to skill name and
      // the description the command has.
      const mine = new Map<string, { name: string; description: string }>()
      // Skills called with their command stay in the model's list.
      const called = new Set<string>()
      let found = new Map<string, FoundSkill>()
      const watchers = await ctx.resources.acquire(
        () => new Map<string, FSWatcher>(),
        (open) => {
          for (const watcher of open.values()) watcher.close()
          open.clear()
        },
      )
      const closed = () => ctx.resources.signal.aborted

      const skillCommand = (name: string, description: string) =>
        defineCommand({
          description: `Skill: ${firstSentence(description)}`,
          input: {
            type: 'string',
            description: 'What the skill should do. Optional.',
          },
          // The command's own session, so the turn runs as the user who
          // ran the command.
          run: (input: unknown, command) => {
            called.add(name)
            void command.session.send(skillPrompt(name, input))
          },
        })

      /** The folder each parent watcher watches, by key. */
      const parents = new Map<string, string>()
      const drop = (key: string) => {
        watchers.get(key)?.close()
        watchers.delete(key)
        parents.delete(key)
      }

      /** Watch `path` under `key`. `false` when `path` does not exist. */
      const tryWatch = (
        key: string,
        path: string,
        recursive: boolean,
      ): boolean => {
        try {
          const watcher = watch(
            path,
            { recursive, persistent: false },
            (event, name) => {
              // The folder itself went away (a delete or a move). Its
              // watcher is dead, so the next sync watches it again.
              if (event === 'rename' && name === basename(path)) drop(key)
              soon()
            },
          )
          watcher.on('error', () => {
            drop(key)
            soon()
          })
          watchers.set(key, watcher)
          return true
        } catch (error) {
          // ponytail: Linux has no recursive watch before Node 19.1. Then
          // only the folder is watched: an added or removed skill shows at
          // once, an edited SKILL.md at the next turn. Watch each skill
          // folder too if edits must show at once there.
          const isUnavailable =
            error instanceof Error &&
            'code' in error &&
            error.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'
          return recursive && isUnavailable ? tryWatch(key, path, false) : false
        }
      }

      /**
       * Watch each skill folder. While a folder does not exist, watch its
       * nearest folder that does, so the skills show as soon as you make the
       * folders, one level at a time.
       */
      const watchFolders = () => {
        for (const dir of dirs) {
          // Some watchers stop with no event when their folder goes away.
          if (watchers.has(dir) && !existsSync(dir)) drop(dir)
          if (watchers.has(dir)) continue
          const parentKey = `${dir} (parent)`
          if (tryWatch(dir, dir, true)) {
            drop(parentKey)
            continue
          }
          let parent = dirname(dir)
          while (!existsSync(parent) && dirname(parent) !== parent) {
            parent = dirname(parent)
          }
          if (parents.get(parentKey) === parent) continue
          drop(parentKey)
          if (tryWatch(parentKey, parent, false)) parents.set(parentKey, parent)
        }
      }

      /** Make the commands match the skills in the folders now. */
      const update = async () => {
        if (closed()) return
        found = await scan(dirs)
        if (closed()) return
        watchFolders()
        const next = new Map<string, { name: string; description: string }>()
        for (const { skill } of found.values()) {
          const isFree =
            !taken.has(skill.name) &&
            (mine.has(skill.name) || !ctx.commands.has(skill.name))
          next.set(isFree ? skill.name : `skill:${skill.name}`, {
            name: skill.name,
            description: skill.description,
          })
        }
        for (const [command, entry] of mine) {
          if (next.get(command)?.name === entry.name) continue
          ctx.commands.delete(command)
          mine.delete(command)
        }
        for (const [command, entry] of next) {
          const isSame = mine.get(command)?.description === entry.description
          if (isSame) continue
          try {
            ctx.commands.set(
              command,
              skillCommand(entry.name, entry.description),
            )
            mine.set(command, entry)
          } catch {
            // Another plugin took `skill:<name>` too. The skill stays in the
            // model's list, with no command.
          }
        }
      }
      // Updates run one after the other.
      let updating = Promise.resolve()
      const sync = () => {
        updating = updating.then(update).catch(() => {})
        return updating
      }

      // A save often fires several watch events: wait until they stop.
      let timer: ReturnType<typeof setTimeout> | undefined
      function soon() {
        clearTimeout(timer)
        timer = setTimeout(() => void sync(), 200)
        timer.unref?.()
      }
      ctx.resources.signal.addEventListener('abort', () => clearTimeout(timer))

      // Commands of the plugins after this one exist only once all are set
      // up, so the first sync waits for that.
      void ctx.commands.ready.then(sync)

      const source: SkillSource = {
        list: async () =>
          [...(await scan(dirs)).values()].map((entry) => entry.skill),
        load: async (name) => (await folderOf(name)).load(name),
        listResources: async (name) =>
          (await (await folderOf(name)).listResources?.(name)) ?? [],
        listScripts: async (name) =>
          (await (await folderOf(name)).listScripts?.(name)) ?? [],
        readResource: async (name, path) => {
          const folder = await folderOf(name)
          if (!folder.readResource) {
            throw new Error(`Skill "${name}" has no resource files.`)
          }
          return folder.readResource(name, path)
        },
      }
      /** The source of the folder that has the skill `name` now. */
      async function folderOf(name: string) {
        const entry = (await scan(dirs)).get(name)
        if (!entry)
          throw new Error(`No skill named "${name}" in ${dirs.join(', ')}.`)
        return skillDirectory(entry.dir, { strict: false })
      }

      const hasOwnCatalog =
        skillsOptions.renderCatalog !== undefined ||
        skillsOptions.instructionTemplate !== undefined
      // The catalog that `withSkills` renders, so the count matches it.
      const render =
        skillsOptions.renderCatalog ??
        (hasOwnCatalog ? renderCatalog : shortCatalog)

      /**
       * Over the token cap: the called skills first, then the folder order,
       * until the list is full. The XML list of Anthropic models is the
       * longest form, so the count uses it.
       */
      const keepEarlier = (listed: Array<SkillMetadata>, limit: number) => {
        const ordered = [
          ...listed.filter((skill) => called.has(skill.name)),
          ...listed.filter((skill) => !called.has(skill.name)),
        ]
        const kept: Array<SkillMetadata> = []
        for (const skill of ordered) {
          const tooLong =
            estimateTokens(render([...kept, skill], 'anthropic')) > limit
          if (tooLong) break
          kept.push(skill)
        }
        return kept
      }

      // The sync runs first, so the commands match the folders at the start
      // of each turn.
      const middleware: Array<AnyChatMiddleware> = [
        { name: 'tanstack/skills:sync', setup: () => sync() },
        withSkills(source, {
          ...skillsOptions,
          ...(hasOwnCatalog ? {} : { renderCatalog: shortCatalog }),
          onLimitExceeded: skillsOptions.onLimitExceeded ?? keepEarlier,
        }),
      ]

      return {
        middleware,
        commands: {
          skills: defineCommand({
            description: 'List the skills, their folders, and their commands',
            run: async () => {
              await sync()
              if (found.size === 0) {
                return `No skills yet. Add a folder with a SKILL.md to one of: ${dirs.join(', ')}`
              }
              const commandOf = new Map(
                [...mine].map(([command, entry]) => [entry.name, command]),
              )
              const lines = [...found.values()].map(({ skill, dir }) => {
                const command = commandOf.get(skill.name)
                const name = command ? `/${command}` : skill.name
                const note =
                  command && command !== skill.name
                    ? ` (/${skill.name} is taken)`
                    : ''
                return `${name}  ${dir}${note}`
              })
              return lines.join('\n')
            },
          }),
        },
      }
    },
  })
}
