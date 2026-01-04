// Microsoft To Do MCP Tools

import { ToolDefinition, McpToolResult } from "../../mcp/types.ts";
import * as todo from "./client.ts";

function formatResult(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function formatError(error: unknown): McpToolResult {
  const message = error instanceof Error
    ? error.message
    : (error as todo.TodoApiError)?.message || "Unknown error";
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export function getMicrosoftTodoTools(): ToolDefinition[] {
  return [
    // =========================================================================
    // Lists
    // =========================================================================
    {
      name: "mstodo_list_lists",
      description: "List all task lists in Microsoft To Do.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async (_params, _userId): Promise<McpToolResult> => {
        try {
          const lists = await todo.listLists();
          return formatResult({
            count: lists.length,
            lists: lists.map(l => ({
              id: l.id,
              displayName: l.displayName,
              isOwner: l.isOwner,
              isShared: l.isShared,
              wellknownListName: l.wellknownListName,
            })),
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "mstodo_get_list",
      description: "Get details of a specific task list.",
      inputSchema: {
        type: "object",
        properties: {
          listId: {
            type: "string",
            description: "Task list ID. Required.",
          },
        },
        required: ["listId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { listId } = params as { listId: string };
          const list = await todo.getList(listId);
          return formatResult(list);
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "mstodo_create_list",
      description: "Create a new task list.",
      inputSchema: {
        type: "object",
        properties: {
          displayName: {
            type: "string",
            description: "Name of the task list. Required.",
          },
        },
        required: ["displayName"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { displayName } = params as { displayName: string };
          const list = await todo.createList({ displayName });
          return formatResult({
            created: true,
            list: {
              id: list.id,
              displayName: list.displayName,
            },
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "mstodo_update_list",
      description: "Update a task list's name.",
      inputSchema: {
        type: "object",
        properties: {
          listId: {
            type: "string",
            description: "Task list ID. Required.",
          },
          displayName: {
            type: "string",
            description: "New name for the task list. Required.",
          },
        },
        required: ["listId", "displayName"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { listId, displayName } = params as { listId: string; displayName: string };
          const list = await todo.updateList(listId, displayName);
          return formatResult({
            updated: true,
            list: {
              id: list.id,
              displayName: list.displayName,
            },
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "mstodo_delete_list",
      description: "Delete a task list.",
      inputSchema: {
        type: "object",
        properties: {
          listId: {
            type: "string",
            description: "Task list ID. Required.",
          },
        },
        required: ["listId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { listId } = params as { listId: string };
          await todo.deleteList(listId);
          return formatResult({ deleted: true, listId });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    // =========================================================================
    // Tasks
    // =========================================================================
    {
      name: "mstodo_list_tasks",
      description: "List tasks in a task list.",
      inputSchema: {
        type: "object",
        properties: {
          listId: {
            type: "string",
            description: "Task list ID. Use mstodo_list_lists to find available lists. Required.",
          },
          filter: {
            type: "string",
            description: "OData filter query. Examples: \"status eq 'notStarted'\", \"importance eq 'high'\".",
          },
          top: {
            type: "number",
            description: "Maximum number of tasks to return.",
          },
        },
        required: ["listId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { listId, filter, top } = params as {
            listId: string;
            filter?: string;
            top?: number;
          };

          const tasks = await todo.listTasks({ listId, filter, top });

          return formatResult({
            count: tasks.length,
            tasks: tasks.map(t => ({
              id: t.id,
              title: t.title,
              status: t.status,
              importance: t.importance,
              dueDateTime: t.dueDateTime,
              createdDateTime: t.createdDateTime,
              categories: t.categories,
              hasAttachments: t.hasAttachments,
            })),
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "mstodo_get_task",
      description: "Get details of a specific task.",
      inputSchema: {
        type: "object",
        properties: {
          listId: {
            type: "string",
            description: "Task list ID. Required.",
          },
          taskId: {
            type: "string",
            description: "Task ID. Required.",
          },
        },
        required: ["listId", "taskId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { listId, taskId } = params as { listId: string; taskId: string };
          const task = await todo.getTask(listId, taskId);
          return formatResult(task);
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "mstodo_create_task",
      description: "Create a new task in Microsoft To Do.",
      inputSchema: {
        type: "object",
        properties: {
          listId: {
            type: "string",
            description: "Task list ID. Use mstodo_list_lists to find available lists. Required.",
          },
          title: {
            type: "string",
            description: "Task title. Required.",
          },
          body: {
            type: "string",
            description: "Task body/notes.",
          },
          importance: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "Task importance. Default is 'normal'.",
          },
          status: {
            type: "string",
            enum: ["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"],
            description: "Task status. Default is 'notStarted'.",
          },
          dueDateTime: {
            type: "object",
            description: "Due date/time.",
            properties: {
              dateTime: { type: "string", description: "ISO 8601 datetime (e.g., '2025-01-15T10:00:00')" },
              timeZone: { type: "string", description: "IANA timezone (e.g., 'Asia/Tokyo')" },
            },
            required: ["dateTime", "timeZone"],
          },
          startDateTime: {
            type: "object",
            description: "Start date/time.",
            properties: {
              dateTime: { type: "string" },
              timeZone: { type: "string" },
            },
            required: ["dateTime", "timeZone"],
          },
          reminderDateTime: {
            type: "object",
            description: "Reminder date/time.",
            properties: {
              dateTime: { type: "string" },
              timeZone: { type: "string" },
            },
            required: ["dateTime", "timeZone"],
          },
          categories: {
            type: "array",
            description: "Task categories/tags.",
            items: { type: "string" },
          },
          isReminderOn: {
            type: "boolean",
            description: "Whether reminder is enabled.",
          },
        },
        required: ["listId", "title"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const {
            listId,
            title,
            body,
            importance,
            status,
            dueDateTime,
            startDateTime,
            reminderDateTime,
            categories,
            isReminderOn,
          } = params as {
            listId: string;
            title: string;
            body?: string;
            importance?: "low" | "normal" | "high";
            status?: "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred";
            dueDateTime?: todo.DateTimeTimeZone;
            startDateTime?: todo.DateTimeTimeZone;
            reminderDateTime?: todo.DateTimeTimeZone;
            categories?: string[];
            isReminderOn?: boolean;
          };

          const task = await todo.createTask({
            listId,
            title,
            body,
            importance,
            status,
            dueDateTime,
            startDateTime,
            reminderDateTime,
            categories,
            isReminderOn,
          });

          return formatResult({
            created: true,
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              importance: task.importance,
              dueDateTime: task.dueDateTime,
            },
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "mstodo_update_task",
      description: "Update an existing task.",
      inputSchema: {
        type: "object",
        properties: {
          listId: {
            type: "string",
            description: "Task list ID. Required.",
          },
          taskId: {
            type: "string",
            description: "Task ID. Required.",
          },
          title: {
            type: "string",
            description: "New task title.",
          },
          body: {
            type: "string",
            description: "New task body/notes.",
          },
          importance: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "New importance level.",
          },
          status: {
            type: "string",
            enum: ["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"],
            description: "New status.",
          },
          dueDateTime: {
            type: "object",
            description: "New due date/time. Set to null to remove.",
            properties: {
              dateTime: { type: "string" },
              timeZone: { type: "string" },
            },
          },
          startDateTime: {
            type: "object",
            description: "New start date/time. Set to null to remove.",
            properties: {
              dateTime: { type: "string" },
              timeZone: { type: "string" },
            },
          },
          reminderDateTime: {
            type: "object",
            description: "New reminder date/time. Set to null to remove.",
            properties: {
              dateTime: { type: "string" },
              timeZone: { type: "string" },
            },
          },
          categories: {
            type: "array",
            description: "New categories/tags.",
            items: { type: "string" },
          },
          isReminderOn: {
            type: "boolean",
            description: "Whether reminder is enabled.",
          },
        },
        required: ["listId", "taskId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const {
            listId,
            taskId,
            title,
            body,
            importance,
            status,
            dueDateTime,
            startDateTime,
            reminderDateTime,
            categories,
            isReminderOn,
          } = params as {
            listId: string;
            taskId: string;
            title?: string;
            body?: string;
            importance?: "low" | "normal" | "high";
            status?: "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred";
            dueDateTime?: todo.DateTimeTimeZone | null;
            startDateTime?: todo.DateTimeTimeZone | null;
            reminderDateTime?: todo.DateTimeTimeZone | null;
            categories?: string[];
            isReminderOn?: boolean;
          };

          const task = await todo.updateTask({
            listId,
            taskId,
            title,
            body,
            importance,
            status,
            dueDateTime,
            startDateTime,
            reminderDateTime,
            categories,
            isReminderOn,
          });

          return formatResult({
            updated: true,
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              importance: task.importance,
              dueDateTime: task.dueDateTime,
            },
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "mstodo_complete_task",
      description: "Mark a task as completed.",
      inputSchema: {
        type: "object",
        properties: {
          listId: {
            type: "string",
            description: "Task list ID. Required.",
          },
          taskId: {
            type: "string",
            description: "Task ID. Required.",
          },
        },
        required: ["listId", "taskId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { listId, taskId } = params as { listId: string; taskId: string };
          const task = await todo.completeTask(listId, taskId);
          return formatResult({
            completed: true,
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              completedDateTime: task.completedDateTime,
            },
          });
        } catch (error) {
          return formatError(error);
        }
      },
    },

    {
      name: "mstodo_delete_task",
      description: "Delete a task.",
      inputSchema: {
        type: "object",
        properties: {
          listId: {
            type: "string",
            description: "Task list ID. Required.",
          },
          taskId: {
            type: "string",
            description: "Task ID. Required.",
          },
        },
        required: ["listId", "taskId"],
      },
      handler: async (params, _userId): Promise<McpToolResult> => {
        try {
          const { listId, taskId } = params as { listId: string; taskId: string };
          await todo.deleteTask(listId, taskId);
          return formatResult({ deleted: true, taskId });
        } catch (error) {
          return formatError(error);
        }
      },
    },
  ];
}
