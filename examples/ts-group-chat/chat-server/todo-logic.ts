import type { TodoItem } from './chat-api.js'

export class TodoLogic {
  private todos: Array<TodoItem> = []
  private onTodosChanged?: (todos: Array<TodoItem>) => Promise<void>

  constructor(callbacks?: {
    onTodosChanged?: (todos: Array<TodoItem>) => Promise<void>
  }) {
    this.onTodosChanged = callbacks?.onTodosChanged
  }

  getTodos(): Array<TodoItem> {
    return this.todos.map((todo) => ({ ...todo }))
  }

  addTodo(text: string, createdBy: string): TodoItem {
    const trimmed = text.trim()
    if (!trimmed) {
      throw new Error('Todo text cannot be empty')
    }

    const todo: TodoItem = {
      id: Math.random().toString(36).slice(2, 11),
      text: trimmed,
      createdAt: new Date().toISOString(),
      createdBy,
    }

    this.todos.push(todo)
    console.log(`✅ Todo added by ${createdBy}: ${todo.text}`)
    void this.emitChange()
    return { ...todo }
  }

  removeTodo(id: string): boolean {
    const index = this.todos.findIndex((todo) => todo.id === id)
    if (index === -1) {
      return false
    }

    const [removed] = this.todos.splice(index, 1)
    console.log(`🗑️ Todo removed: ${removed.text}`)
    void this.emitChange()
    return true
  }

  private async emitChange() {
    if (this.onTodosChanged) {
      await this.onTodosChanged(this.getTodos())
    }
  }
}
