import { existsSync, watch } from 'node:fs'
import { basename, dirname } from 'node:path'
import { firstSentence } from '@tanstack/ai'
import { defineCommand, definePlugin } from '@tanstack/ai-harness'
import { renderCatalog } from './catalog'
import { estimateTokens, withSkills } from './middleware'
import { skillDirectory } from './node'
import type { FSWatcher } from 'node:fs'
import type { AnyChatMiddleware } from '@tanstack/ai'
import type { PluginResources, PluginSetupContext } from '@tanstack/ai-harness'
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

/** The `code` of a Node.js error, for example `ENOENT`. */
function codeOf(error: unknown) {
  const hasCode = error instanceof Error && 'code' in error
  return hasCode ? error.code : undefined
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
 * The part of {@link skills} that every session of a harness on a host
 * shares: the watchers of the folders. A change only tells the sessions to
 * sync. Each sync reads the skills from disk again.
 */
async function sharedFolders(
  dirs: ReadonlyArray<string>,
  resources: PluginResources,
) {
  /** The watcher of each folder, and the path it watches. */
  const watchers = await resources.acquire(
    () => new Map<string, { watcher: FSWatcher; path: string }>(),
    (open) => {
      for (const { watcher } of open.values()) watcher.close()
      open.clear()
    },
  )
  /** The folders that cannot be watched. They were warned about once. */
  const failed = new Set<string>()
  /** The sessions to tell when a folder changed. */
  const listeners = new Set<() => void>()

  // A save often fires several watch events: wait until they stop.
  let timer: ReturnType<typeof setTimeout> | undefined
  const soon = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      for (const listener of listeners) listener()
    }, 200)
    timer.unref?.()
  }
  resources.signal.addEventListener('abort', () => clearTimeout(timer))

  const drop = (dir: string) => {
    watchers.get(dir)?.watcher.close()
    watchers.delete(dir)
  }

  /** Watch `path` for the folder `dir`. Throws when `watch` throws. */
  const start = (dir: string, path: string, recursive: boolean) => {
    const watcher = watch(
      path,
      { recursive, persistent: false },
      (event, name) => {
        // The watched folder itself went away (a delete or a move). Its
        // watcher is dead, so the next sync watches it again.
        if (event === 'rename' && name === basename(path)) drop(dir)
        soon()
      },
    )
    watcher.on('error', () => {
      drop(dir)
      soon()
    })
    watchers.set(dir, { watcher, path })
  }

  /** Watch the folder `dir` at `path`: the folder itself, or a parent. */
  const watchAt = (dir: string, path: string) => {
    const isOwn = path === dir
    try {
      return start(dir, path, isOwn)
    } catch (error) {
      // ponytail: Linux has no recursive watch before Node 19.1. Then only
      // the folder is watched: an added or removed skill shows at once, an
      // edited SKILL.md at the next turn.
      if (codeOf(error) !== 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') throw error
      console.warn(
        `skills: cannot watch the subfolders of ${dir} on this platform. An edited SKILL.md shows at the next turn.`,
      )
      return start(dir, path, false)
    }
  }

  /**
   * Watch each skill folder. While a folder does not exist, watch its
   * nearest folder that does, so the skills show as soon as you make the
   * folders, one level at a time.
   */
  const watchFolders = () => {
    if (resources.signal.aborted) return
    for (const dir of dirs) {
      if (failed.has(dir)) continue
      // Some watchers stop with no event when their folder goes away, so
      // check that the folder is still there.
      let path = dir
      while (!existsSync(path) && dirname(path) !== path) path = dirname(path)
      if (watchers.get(dir)?.path === path) continue
      drop(dir)
      try {
        watchAt(dir, path)
      } catch (error) {
        // The folder went away since the check. The next sync tries again.
        if (codeOf(error) === 'ENOENT') continue
        failed.add(dir)
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(
          `skills: cannot watch ${dir} (${reason}). Its skills change at the next turn.`,
        )
      }
    }
  }

  /**
   * The skills of `dirs`, by name, in folder order. The first folder wins a
   * name. A folder that is missing or cannot be read gives no skills, and a
   * broken `SKILL.md` is left out.
   */
  const read = async () => {
    watchFolders()
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

  /** The source of the folder that has the skill `name` now. */
  const folderOf = async (name: string) => {
    const entry = (await read()).get(name)
    if (!entry) {
      throw new Error(`No skill named "${name}" in ${dirs.join(', ')}.`)
    }
    return skillDirectory(entry.dir, { strict: false })
  }

  const source: SkillSource = {
    list: async () => [...(await read()).values()].map((entry) => entry.skill),
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

  watchFolders()

  return {
    source,
    read,
    /** Call `listener` after a folder changed. Returns a function that stops it. */
    onChange: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** The part of {@link skills} that each session sets up. */
async function sessionPart(
  ctx: PluginSetupContext,
  folders: Awaited<ReturnType<typeof sharedFolders>>,
  options: SkillsPluginOptions,
) {
  const { dirs, reserved = [], ...skillsOptions } = options
  // `skills` is this plugin's own command, so a skill named `skills` gets
  // the prefix too.
  const taken = new Set(['skills', ...reserved])
  // The skill commands of this session: command name to skill name and the
  // description the command has.
  const mine = new Map<string, { name: string; description: string }>()
  // Skills called with their command stay in the model's list.
  const called = new Set<string>()
  let found = new Map<string, FoundSkill>()
  const closed = () => ctx.resources.signal.aborted

  const skillCommand = (name: string, description: string) =>
    defineCommand({
      description: `Skill: ${firstSentence(description)}`,
      input: {
        type: 'string',
        description: 'What the skill should do. Optional.',
      },
      // The command's own session, so the turn runs as the user who ran the
      // command.
      run: (input: unknown, command) => {
        called.add(name)
        void command.session.send(skillPrompt(name, input))
      },
    })

  /** Make the commands match the skills in the folders now. */
  const update = async () => {
    if (closed()) return
    found = await folders.read()
    if (closed()) return
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
        ctx.commands.set(command, skillCommand(entry.name, entry.description))
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

  await ctx.resources.acquire(
    () => folders.onChange(() => void sync()),
    (stop) => stop(),
  )
  // Commands of the plugins after this one exist only once all are set up,
  // so the first sync waits for that.
  void ctx.commands.ready.then(sync)

  const hasOwnCatalog =
    skillsOptions.renderCatalog !== undefined ||
    skillsOptions.instructionTemplate !== undefined
  // The catalog that `withSkills` renders, so the count matches it.
  const render =
    skillsOptions.renderCatalog ??
    (hasOwnCatalog ? renderCatalog : shortCatalog)

  /**
   * Over the token cap: the called skills first, then the folder order,
   * until the list is full. The XML list of Anthropic models is the longest
   * form, so the count uses it.
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

  // The sync runs first, so the commands match the folders at the start of
  // each turn.
  const middleware: Array<AnyChatMiddleware> = [
    { name: 'tanstack/skills:sync', setup: () => sync() },
    withSkills(folders.source, {
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
}

/**
 * A harness plugin that gives the model the skills of `dirs`, and makes each
 * skill a command: `/<name> [task]` starts a turn that tells the model to use
 * the skill. A skill whose name another command has is `/skill:<name>`.
 * `/skills` lists every skill, its folder, and its command.
 *
 * The plugin watches each folder once for each host, and every session of
 * the harness that uses this plugin object shares the watchers. Create it
 * once, outside the `plugins` factory. It reads the folders again at the start
 * of each turn. A skill that you add, change, or remove while a session runs
 * changes the commands at once, with no restart. When a folder cannot be
 * watched, the plugin warns once, and its skills change at the next turn.
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
 * const agentSkills = skills({
 *   dirs: ['./.agents/skills', join(homedir(), '.acme', 'skills')],
 * })
 *
 * defineHarness({
 *   name: 'acme/agent',
 *   adapter,
 *   plugins: () => [agentSkills],
 * })
 * ```
 */
export function skills(options: SkillsPluginOptions) {
  return definePlugin({
    name: 'tanstack/skills',
    // The folder watchers are shared by the sessions of the host. The
    // commands and the model's skill list are per session.
    lifetime: 'host',
    setup: async (host) => {
      const folders = await sharedFolders(options.dirs, host.resources)
      return {
        session: (ctx) => sessionPart(ctx, folders, options),
      }
    },
  })
}
