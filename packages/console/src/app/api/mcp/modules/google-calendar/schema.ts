// packages/console/src/app/api/mcp/modules/google-calendar/schema.ts

import {
  ModuleDefinition,
  ToolDefinition,
  ToolHandler,
  McpToolResult,
} from "../../lib/types";
import * as calendar from "./client";

function formatResult(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function formatError(error: unknown): McpToolResult {
  const message =
    error instanceof Error
      ? error.message
      : (error as calendar.CalendarApiError)?.message || "Unknown error";
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

const tools: ToolDefinition[] = [
  // Time
  {
    name: "gcal_get_current_time",
    description:
      "Get the current date and time. Call this FIRST before creating, updating, or searching for events to ensure you have accurate date context for scheduling.",
    inputSchema: {
      type: "object",
      properties: {
        timeZone: {
          type: "string",
          description:
            "IANA timezone string (e.g., 'Asia/Tokyo', 'America/New_York'). Defaults to Asia/Tokyo.",
        },
      },
    },
  },
  // Calendars
  {
    name: "gcal_list_calendars",
    description: "List all available calendars for the authenticated user.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  // Colors
  {
    name: "gcal_list_colors",
    description:
      "List available color IDs and their meanings for calendar events.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  // Events - Read
  {
    name: "gcal_list_events",
    description: "List events from a calendar within a time range.",
    inputSchema: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description:
            "Calendar ID. Use 'primary' for the primary calendar or a specific calendar ID.",
        },
        timeMin: {
          type: "string",
          description:
            "Start of time range (ISO 8601 format, e.g., '2025-01-01T00:00:00+09:00'). Required.",
        },
        timeMax: {
          type: "string",
          description: "End of time range (ISO 8601 format). Required.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of events to return. Default is 250.",
        },
        singleEvents: {
          type: "boolean",
          description:
            "Expand recurring events into individual instances. Default is true.",
          default: true,
        },
        orderBy: {
          type: "string",
          enum: ["startTime", "updated"],
          description:
            "Order by 'startTime' or 'updated'. Requires singleEvents=true for startTime.",
        },
        timeZone: {
          type: "string",
          description: "IANA timezone for the response.",
        },
      },
      required: ["timeMin", "timeMax"],
    },
  },
  {
    name: "gcal_search_events",
    description: "Search for events in a calendar by text query.",
    inputSchema: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description:
            "Calendar ID. Use 'primary' for the primary calendar.",
        },
        query: {
          type: "string",
          description:
            "Free text search query to match against event summary, description, location, etc.",
        },
        timeMin: {
          type: "string",
          description: "Start of time range (ISO 8601 format). Required.",
        },
        timeMax: {
          type: "string",
          description: "End of time range (ISO 8601 format). Required.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of events to return.",
        },
        timeZone: {
          type: "string",
          description: "IANA timezone for the response.",
        },
      },
      required: ["query", "timeMin", "timeMax"],
    },
  },
  {
    name: "gcal_get_event",
    description: "Get details of a specific event by ID.",
    inputSchema: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID. Required.",
        },
        eventId: {
          type: "string",
          description: "Event ID. Required.",
        },
      },
      required: ["calendarId", "eventId"],
    },
  },
  // Events - Write
  {
    name: "gcal_create_event",
    description: "Create a new calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description:
            "Calendar ID. Use 'primary' for the primary calendar.",
        },
        summary: {
          type: "string",
          description: "Event title/summary. Required.",
        },
        description: {
          type: "string",
          description: "Event description.",
        },
        location: {
          type: "string",
          description: "Event location.",
        },
        start: {
          type: "object",
          description:
            "Start time. Use { dateTime: 'ISO8601' } for timed events or { date: 'YYYY-MM-DD' } for all-day events.",
          properties: {
            dateTime: {
              type: "string",
              description:
                "ISO 8601 datetime (e.g., '2025-01-15T09:00:00+09:00')",
            },
            date: {
              type: "string",
              description: "Date for all-day event (e.g., '2025-01-15')",
            },
            timeZone: { type: "string", description: "IANA timezone" },
          },
        },
        end: {
          type: "object",
          description: "End time. Same format as start.",
          properties: {
            dateTime: { type: "string" },
            date: { type: "string" },
            timeZone: { type: "string" },
          },
        },
        attendees: {
          type: "array",
          description: "List of attendee emails.",
          items: {
            type: "object",
            properties: {
              email: { type: "string" },
              optional: { type: "boolean" },
            },
            required: ["email"],
          },
        },
        colorId: {
          type: "string",
          description:
            "Event color ID (1-11). Use gcal_list_colors to see available colors.",
        },
        recurrence: {
          type: "array",
          description:
            "RRULE, EXRULE, RDATE, or EXDATE lines for recurring events.",
          items: { type: "string" },
        },
        sendUpdates: {
          type: "string",
          enum: ["all", "externalOnly", "none"],
          description: "Whether to send notifications. Default is 'none'.",
        },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    name: "gcal_update_event",
    description: "Update an existing calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID. Required.",
        },
        eventId: {
          type: "string",
          description: "Event ID. Required.",
        },
        summary: {
          type: "string",
          description: "New event title/summary.",
        },
        description: {
          type: "string",
          description: "New event description.",
        },
        location: {
          type: "string",
          description: "New event location.",
        },
        start: {
          type: "object",
          description: "New start time.",
          properties: {
            dateTime: { type: "string" },
            date: { type: "string" },
            timeZone: { type: "string" },
          },
        },
        end: {
          type: "object",
          description: "New end time.",
          properties: {
            dateTime: { type: "string" },
            date: { type: "string" },
            timeZone: { type: "string" },
          },
        },
        attendees: {
          type: "array",
          description: "Updated list of attendees.",
          items: {
            type: "object",
            properties: {
              email: { type: "string" },
              optional: { type: "boolean" },
            },
          },
        },
        colorId: {
          type: "string",
          description: "New event color ID.",
        },
        sendUpdates: {
          type: "string",
          enum: ["all", "externalOnly", "none"],
          description: "Whether to send notifications. Default is 'none'.",
        },
      },
      required: ["calendarId", "eventId"],
    },
  },
  {
    name: "gcal_delete_event",
    description: "Delete a calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID. Required.",
        },
        eventId: {
          type: "string",
          description: "Event ID. Required.",
        },
        sendUpdates: {
          type: "string",
          enum: ["all", "externalOnly", "none"],
          description:
            "Whether to send cancellation notifications. Default is 'none'.",
        },
      },
      required: ["calendarId", "eventId"],
    },
  },
  // Free/Busy
  {
    name: "gcal_get_freebusy",
    description:
      "Query free/busy information for calendars. Useful for finding available time slots.",
    inputSchema: {
      type: "object",
      properties: {
        timeMin: {
          type: "string",
          description: "Start of time range (ISO 8601 format). Required.",
        },
        timeMax: {
          type: "string",
          description:
            "End of time range (ISO 8601 format). Required. Max 3 months from timeMin.",
        },
        calendars: {
          type: "array",
          description: "List of calendar IDs to check. Required.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Calendar ID" },
            },
            required: ["id"],
          },
        },
        timeZone: {
          type: "string",
          description: "IANA timezone for the response.",
        },
      },
      required: ["timeMin", "timeMax", "calendars"],
    },
  },
];

// Handlers
const gcalGetCurrentTime: ToolHandler = async (params, _userId) => {
  try {
    const { timeZone } = params as { timeZone?: string };
    const result = calendar.getCurrentTime(timeZone);
    return formatResult(result);
  } catch (error) {
    return formatError(error);
  }
};

const gcalListCalendars: ToolHandler = async (_params, userId) => {
  try {
    const calendars = await calendar.listCalendars(userId);
    return formatResult({
      calendars: calendars.map((c) => ({
        id: c.id,
        summary: c.summary,
        primary: c.primary || false,
        accessRole: c.accessRole,
        backgroundColor: c.backgroundColor,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
};

const gcalListColors: ToolHandler = async (_params, userId) => {
  try {
    const colors = await calendar.getColors(userId);
    return formatResult(colors);
  } catch (error) {
    return formatError(error);
  }
};

const gcalListEvents: ToolHandler = async (params, userId) => {
  try {
    const {
      calendarId,
      timeMin,
      timeMax,
      maxResults,
      singleEvents = true,
      orderBy,
      timeZone,
    } = params as {
      calendarId?: string;
      timeMin: string;
      timeMax: string;
      maxResults?: number;
      singleEvents?: boolean;
      orderBy?: "startTime" | "updated";
      timeZone?: string;
    };

    const events = await calendar.listEvents(userId, {
      calendarId,
      timeMin,
      timeMax,
      maxResults,
      singleEvents,
      orderBy: singleEvents ? orderBy || "startTime" : orderBy,
      timeZone,
    });

    return formatResult({
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        summary: e.summary,
        start: e.start,
        end: e.end,
        location: e.location,
        description: e.description,
        status: e.status,
        htmlLink: e.htmlLink,
        colorId: e.colorId,
        attendees: e.attendees?.length,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
};

const gcalSearchEvents: ToolHandler = async (params, userId) => {
  try {
    const { calendarId, query, timeMin, timeMax, maxResults, timeZone } =
      params as {
        calendarId?: string;
        query: string;
        timeMin: string;
        timeMax: string;
        maxResults?: number;
        timeZone?: string;
      };

    const events = await calendar.listEvents(userId, {
      calendarId,
      timeMin,
      timeMax,
      maxResults,
      q: query,
      singleEvents: true,
      orderBy: "startTime",
      timeZone,
    });

    return formatResult({
      query,
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        summary: e.summary,
        start: e.start,
        end: e.end,
        location: e.location,
        description: e.description,
        htmlLink: e.htmlLink,
      })),
    });
  } catch (error) {
    return formatError(error);
  }
};

const gcalGetEvent: ToolHandler = async (params, userId) => {
  try {
    const { calendarId, eventId } = params as {
      calendarId: string;
      eventId: string;
    };
    const event = await calendar.getEvent(userId, calendarId, eventId);
    return formatResult(event);
  } catch (error) {
    return formatError(error);
  }
};

const gcalCreateEvent: ToolHandler = async (params, userId) => {
  try {
    const {
      calendarId,
      summary,
      description,
      location,
      start,
      end,
      attendees,
      colorId,
      recurrence,
      sendUpdates = "none",
    } = params as {
      calendarId?: string;
      summary: string;
      description?: string;
      location?: string;
      start: calendar.EventDateTime;
      end: calendar.EventDateTime;
      attendees?: calendar.EventAttendee[];
      colorId?: string;
      recurrence?: string[];
      sendUpdates?: "all" | "externalOnly" | "none";
    };

    const event = await calendar.createEvent(userId, {
      calendarId,
      summary,
      description,
      location,
      start,
      end,
      attendees,
      colorId,
      recurrence,
      sendUpdates,
    });

    return formatResult({
      created: true,
      event: {
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end,
        htmlLink: event.htmlLink,
      },
    });
  } catch (error) {
    return formatError(error);
  }
};

const gcalUpdateEvent: ToolHandler = async (params, userId) => {
  try {
    const {
      calendarId,
      eventId,
      summary,
      description,
      location,
      start,
      end,
      attendees,
      colorId,
      sendUpdates = "none",
    } = params as {
      calendarId: string;
      eventId: string;
      summary?: string;
      description?: string;
      location?: string;
      start?: calendar.EventDateTime;
      end?: calendar.EventDateTime;
      attendees?: calendar.EventAttendee[];
      colorId?: string;
      sendUpdates?: "all" | "externalOnly" | "none";
    };

    const event = await calendar.updateEvent(userId, {
      calendarId,
      eventId,
      summary,
      description,
      location,
      start,
      end,
      attendees,
      colorId,
      sendUpdates,
    });

    return formatResult({
      updated: true,
      event: {
        id: event.id,
        summary: event.summary,
        start: event.start,
        end: event.end,
        htmlLink: event.htmlLink,
      },
    });
  } catch (error) {
    return formatError(error);
  }
};

const gcalDeleteEvent: ToolHandler = async (params, userId) => {
  try {
    const { calendarId, eventId, sendUpdates = "none" } = params as {
      calendarId: string;
      eventId: string;
      sendUpdates?: "all" | "externalOnly" | "none";
    };

    await calendar.deleteEvent(userId, { calendarId, eventId, sendUpdates });

    return formatResult({ deleted: true, eventId });
  } catch (error) {
    return formatError(error);
  }
};

const gcalGetFreeBusy: ToolHandler = async (params, userId) => {
  try {
    const { timeMin, timeMax, calendars, timeZone } = params as {
      timeMin: string;
      timeMax: string;
      calendars: Array<{ id: string }>;
      timeZone?: string;
    };

    const result = await calendar.getFreeBusy(userId, {
      timeMin,
      timeMax,
      items: calendars,
      timeZone,
    });

    return formatResult(result);
  } catch (error) {
    return formatError(error);
  }
};

const handlers: Record<string, ToolHandler> = {
  gcal_get_current_time: gcalGetCurrentTime,
  gcal_list_calendars: gcalListCalendars,
  gcal_list_colors: gcalListColors,
  gcal_list_events: gcalListEvents,
  gcal_search_events: gcalSearchEvents,
  gcal_get_event: gcalGetEvent,
  gcal_create_event: gcalCreateEvent,
  gcal_update_event: gcalUpdateEvent,
  gcal_delete_event: gcalDeleteEvent,
  gcal_get_freebusy: gcalGetFreeBusy,
};

export const googleCalendarModule: ModuleDefinition = {
  name: "google_calendar",
  description: "Google Calendar 予定の取得・作成・更新",
  tools,
  handlers,
};
