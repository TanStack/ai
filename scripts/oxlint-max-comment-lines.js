const DIRECTIVE =
  /^(?:oxlint-|eslint-|ts-|@ts-|spdx-license-identifier|copyright\b|licensed under)/i

function isDirective(comment) {
  return DIRECTIVE.test(comment.value.trim())
}

function isJsdoc(comment) {
  return comment.type === 'Block' && comment.value.trimStart().startsWith('*')
}

function commentLineCount(comment) {
  return comment.loc.end.line - comment.loc.start.line + 1
}

export { isDirective, isJsdoc, commentLineCount }

const plugin = {
  meta: { name: 'comment-limits' },
  rules: {
    'max-lines': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Disallow long non-JSDoc comments. JSDoc (`/** ... */`) is allowed.',
        },
        schema: [],
        messages: {
          tooLong:
            'Comments must be at most 2 lines. Delete the extra lines or the whole comment.',
        },
      },
      create(context) {
        const sourceCode = context.sourceCode ?? context.getSourceCode()
        return {
          Program() {
            const comments = sourceCode.getAllComments()
            for (const comment of comments) {
              if (isDirective(comment) || isJsdoc(comment)) continue
              if (commentLineCount(comment) > 2) {
                context.report({ loc: comment.loc, messageId: 'tooLong' })
              }
            }

            let run = []
            const flush = () => {
              if (run.length > 2) {
                context.report({
                  loc: {
                    start: run[0].loc.start,
                    end: run[run.length - 1].loc.end,
                  },
                  messageId: 'tooLong',
                })
              }
              run = []
            }

            for (const comment of comments) {
              if (comment.type !== 'Line' || isDirective(comment)) {
                flush()
                continue
              }
              const prev = run[run.length - 1]
              if (prev && comment.loc.start.line === prev.loc.end.line + 1) {
                run.push(comment)
              } else {
                flush()
                run = [comment]
              }
            }
            flush()
          },
        }
      },
    },
  },
}

export default plugin
