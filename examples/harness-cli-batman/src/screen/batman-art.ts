/** ASCII from asciiart.eu. Initials stay on the drawings (snd, z_M). */

function padArt(lines: ReadonlyArray<string>) {
  const width = Math.max(0, ...lines.map((line) => line.length))
  return lines.map((line) => line.padEnd(width))
}

/** Bat symbol. Joan Stark / unknown, 60 x 21. asciiart.eu/art/f5be3a8046b61e0a */
export const SYMBOL = padArt([
  '                   ,.ood888888888888boo.,',
  '              .od888P^""            ""^Y888bo.',
  "          .od8P''   ..oood88888888booo.    ``Y8bo.",
  '       .odP\'"  .ood8888888888888888888888boo.  "`Ybo.',
  "     .d8'   od8'd888888888f`8888't888888888b`8bo   `Yb.",
  "    d8'  od8^   8888888888[  `'  ]8888888888   ^8bo  `8b",
  "  .8P  d88'     8888888888P      Y8888888888     `88b  Y8.",
  " d8' .d8'       `Y88888888'      `88888888P'       `8b. `8b",
  '.8P .88P            """"            """"            Y88. Y8.',
  '88  888                                              888  88',
  '88  888                                              888  88',
  '88  888.        ..                        ..        .888  88',
  "`8b `88b,     d8888b.od8bo.      .od8bo.d8888b     ,d88' d8'",
  " Y8. `Y88.    8888888888888b    d8888888888888    .88P' .8P",
  "  `8b  Y88b.  `88888888888888  88888888888888'  .d88P  d8'",
  '    Y8.  ^Y88bod8888888888888..8888888888888bod88P^  .8P',
  "     `Y8.   ^Y888888888888888LS888888888888888P^   .8P'",
  "       `^Yb.,  `^^Y8888888888888888888888P^^'  ,.dP^'",
  "          `^Y8b..   ``^^^Y88888888P^^^'    ..d8P^'",
  "              `^Y888bo.,            ,.od888P^'",
  '                   "`^^Y888888888888P^^\'"',
])

/** Standing Batman. Shanaka Dias (snd), 24 x 22. asciiart.eu/art/59a93c84f7c5a9f6 */
export const STAND = padArt([
  '          .  .',
  '          |\\_|\\',
  '          | a_a\\',
  '          | | "]',
  "      ____| '-\\___",
  "     /.----.___.-'\\",
  '    //        _    \\',
  '   //   .-. (~v~) /|',
  "  |'|  /\\:  .--  / \\",
  ' // |-/  \\_/____/\\/~|',
  '|/  \\ |  []_|_|_] \\ |',
  '| \\  | \\ |___   _\\ ]_}',
  "| |  '-' /   '.'  |",
  '| |     /    /|:  | ',
  '| |     |   / |:  /\\',
  '| |     /  /  |  /  \\',
  '| |    |  /  /  |    \\',
  '\\ |    |/\\/  |/|/\\    \\',
  ' \\|\\ |\\|  |  | / /\\/\\__\\',
  '  \\ \\| | /   | |__',
  'snd    / |   |____)',
  '       |_/',
])

/** Batman with the cape out. Shanaka Dias (snd), 45 x 26. asciiart.eu/art/39ab1850ef7b32a8 */
export const CAPE = padArt([
  '           |    |              _.-7',
  '           |\\.-.|             ( ,(_',
  '           | a a|              \\\\  \\,',
  '           ) ["||          _.--\' \\  \\\\',
  "        .-'  '-''-..____.-'    ___)  )\\",
  "       F   _/-``-.__;-.-.--`--' . .' \\_L_",
  "      |   l  {~~} ,_\\  '.'.      ` __.' )\\",
  "      (    -.;___,;  | '- _       :__.'( /",
  "      | -.__ _/_.'.-'      '-._ .'      \\\\",
  "      |     .'   |  -- _                 '\\,",
  "      |  \\ /--,--{ .    '---.__.       .'  .'",
  "      J  ;/ __;__]. '.-.            .-' )_/",
  "      J  (-.     '\\'. '. '-._.-.-'--._ /",
  "      |  |  '. .' | \\'. '.    ._       \\",
  "      |   \\   T   |  \\  '. '._  '-._    '.",
  "      F   J   |   |  '.    .  '._   '-,_.--`",
  "      F   \\   \\   F .  \\    '.   '.  /",
  "     J     \\  |  J   \\  '.   '.    '/",
  "     J      '.L__|    .   \\    '    |",
  "     |   .    \\  |     \\   '.   '. /",
  "     |    '    '.|      |    ,-.  (",
  "     F   | ' ___  ',._   .  /   '. \\",
  "     F   (.'`|| (-._\\ '.  \\-      '-\\",
  "     \\ .-'  ( L `._ '\\ '._ (",
  "snd  /'  |  /  '-._\\      ''\\",
  "         `-'",
])

/** Batman with pointed ears. z_M, 48 x 25. asciiart.eu/art/7b11b14980469ed1 */
export const EARS = padArt([
  '                T\\ T\\',
  '                | \\| \\',
  '                |  |  :',
  '           _____I__I  |',
  "         .'            '.",
  "       .'                '",
  "       |   ..             '",
  '       |  /__.            |',
  "       :.' -'             |",
  '      /__.                |',
  '     /__, \\               |',
  '        |__\\        _|    |',
  "        :  '\\     .'|     |",
  '        |___|_,,,/  |     |    _..--.',
  "     ,--_-   |     /'      \\../ /  /\\\\",
  "    ,'|_ I---|    7    ,,,_/ / ,  / _\\\\",
  "  ,-- 7 \\|  / ___..,,/   /  ,  ,_/   '-----.",
  " /   ,   \\  |/  ,____,,,__,,__/            '\\",
  ',   ,     \\__,,/                             |',
  "| '.       _..---.._                         !.",
  "! |      .' z_M__s. '.                        |",
  ".:'      | (-_ _--')  :          L            !",
  ".'.       '.  Y    _.'             \\,         :",
  " .          '-----'                 !          .",
  ' .           /  \\                   .          .',
])

/** The three figure poses, padded to one size so the animation does not jump. */
export const POSES = padFrames([STAND, CAPE, EARS])

function padFrames(frames: ReadonlyArray<ReadonlyArray<string>>) {
  const width = Math.max(...frames.map((frame) => frame[0]?.length ?? 0))
  const height = Math.max(...frames.map((frame) => frame.length))
  return frames.map((frame) => {
    const left = Math.floor((width - (frame[0]?.length ?? 0)) / 2)
    const top = Math.floor((height - frame.length) / 2)
    const rows = [
      ...Array.from({ length: top }, () => ' '.repeat(width)),
      ...frame.map((line) => line.padStart(line.length + left).padEnd(width)),
      ...Array.from({ length: height - top - frame.length }, () =>
        ' '.repeat(width),
      ),
    ]
    return rows
  })
}
