"""One-off utility that rewrites PersonTrackingModal.jsx with corrected Hebrew UI strings.

Responsibility: regenerate modal source content during manual recovery/debug workflows.
"""

import os

filepath = 'frontend/src/components/PersonTrackingModal.jsx'

# Hebrew strings
bitol = "\u05d1\u05d9\u05d8\u05d5\u05dc"           # ביטול
tikun = "\u05ea\u05d9\u05e7\u05d5\u05df"            # תיקון
idkun_mikom = "\u05e2\u05d3\u05db\u05d5\u05df \u05de\u05d9\u05e7\u05d5\u05dd"  # עדכון מיקום
maakav_mikumi = "\u05de\u05e2\u05e7\u05d1 \u05de\u05d9\u05e7\u05d5\u05de\u05d9"  # מעקב מיקומי
makom = "\u05de\u05d9\u05e7\u05d5\u05dd"            # מיקום
status = "\u05e1\u05d8\u05d8\u05d5\u05e1"          # סטטוס
takin = "\u05ea\u05e7\u05d9\u05df"                  # תקין
lo_takin = "\u05dc\u05d0 \u05ea\u05e7\u05d9\u05df" # לא תקין
lo_hoznan = "\u05dc\u05d0 \u05d4\u05d5\u05d6\u05df" # לא הוזן
zman_irua = "\u05d6\u05de\u05df \u05d0\u05d9\u05e8\u05d5\u05e2"  # זמן אירוע
hosaf_irua = "\u05d4\u05d5\u05e1\u05e3 \u05d0\u05d9\u05e8\u05d5\u05e2"  # הוסף אירוע
batel = "\u05d1\u05d8\u05dc"                        # בטל
readonly_note = "\u05ea\u05e6\u05d5\u05d2\u05ea \u05d4\u05d9\u05e1\u05d8\u05d5\u05e8\u05d9\u05d4 \u05d1\u05dc\u05d1\u05d3. \u05d4\u05d5\u05e1\u05e4\u05d4 \u05d5\u05de\u05d7\u05d9\u05e7\u05d4 \u05d6\u05de\u05d9\u05e0\u05d5\u05ea \u05e8\u05e7 \u05d1\u05d9\u05d5\u05dd \u05d4\u05e0\u05d5\u05db\u05d7\u05d9."  # תצוגת היסטוריה בלבד. הוספה ומחיקה זמינות רק ביום הנוכחי.
iruim = "\u05d0\u05d9\u05e8\u05d5\u05e2\u05d9\u05dd"  # אירועים
ein_iruim = "\u05d0\u05d9\u05df \u05d0\u05d9\u05e8\u05d5\u05e2\u05d9 \u05de\u05d9\u05e7\u05d5\u05dd \u05dc\u05de\u05d6\u05d4\u05d4 \u05d6\u05d4 \u05d1\u05ea\u05d0\u05e8\u05d9\u05da \u05e9\u05e0\u05d1\u05d7\u05e8."  # אין אירועי מיקום למזהה זה בתאריך שנבחר.
sug = "\u05e1\u05d5\u05d2"                          # סוג
maavar_prefix = "\u05de\u05e2\u05d1\u05e8"         # מעבר
techilat_rezef = "\u05ea\u05d7\u05d9\u05dc\u05ea \u05e8\u05e6\u05e3 (\u05d0\u05d9\u05df \u05de\u05e2\u05d1\u05e8 \u05e7\u05d5\u05d3\u05dd)"  # תחילת רצף (אין מעבר קודם)
mazahe_irua = "\u05de\u05d6\u05d4\u05d4 \u05d0\u05d9\u05e8\u05d5\u05e2"  # מזהה אירוע
namchak = "\u05e0\u05de\u05d7\u05e7"               # נמחק
mchak_irua = "\u05de\u05d7\u05e7 \u05d0\u05d9\u05e8\u05d5\u05e2"  # מחק אירוע
maavarim_mechushavim = "\u05de\u05e2\u05d1\u05e8\u05d9\u05dd \u05de\u05d7\u05d5\u05e9\u05d1\u05d9\u05dd"  # מעברים מחושבים
ein_maavarim = "\u05d0\u05d9\u05df \u05de\u05e2\u05d1\u05e8\u05d9\u05dd \u05de\u05d7\u05d5\u05e9\u05d1\u05d9\u05dd \u05dc\u05ea\u05d0\u05e8\u05d9\u05da \u05d6\u05d4."  # אין מעברים מחושבים לתאריך זה.
shahiya = "\u05e9\u05d4\u05d9\u05d9\u05d4"         # שהייה
dakot = "\u05d3\u05e7\u05d5\u05ea"                  # דקות
sagur = "\u05e1\u05d2\u05d5\u05e8"                  # סגור
me_prefix = "\u05de\u05d0"                          # מ
le_prefix = "\u05dc\u05d0"                          # ל

content = f'''// Modal component for per-person location event tracking and undo workflow.

import {{ useEffect, useMemo, useState }} from "react";
import {{ getLocationChipClass }} from "../constants/locations";
import {{
  DAILY_STATUS_BAD,
  DAILY_STATUS_MISSING,
  DAILY_STATUS_OK,
  getDailyStatusChipClass,
}} from "../constants/statuses";

function toLocalDateTimeInput(value) {{
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {{
    return "";
  }}
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${{year}}-${{month}}-${{day}}T${{hours}}:${{minutes}}`;
}}

function toUtcIsoFromLocalInput(value) {{
  if (!value) {{
    return undefined;
  }}
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {{
    return undefined;
  }}
  return parsed.toISOString();
}}

function formatEventTimestamp(value) {{
  if (!value) {{
    return "-";
  }}

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {{
    return value;
  }}

  return parsed.toLocaleString("he-IL", {{
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }});
}}

function formatEventType(eventType) {{
  if (eventType === "undo") {{
    return "{bitol}";
  }}
  if (eventType === "correction") {{
    return "{tikun}";
  }}
  return "{idkun_mikom}";
}}

function PersonTrackingModal({{
  open,
  person,
  readOnly,
  loading,
  locationOptions,
  events,
  transitions,
  latestTransitionWarning,
  canUndo,
  undoSecondsLeft,
  onClose,
  onAddEvent,
  onDeleteEvent,
  onUndoLastAction,
}}) {{
  const [form, setForm] = useState({{
    location: "",
    daily_status: DAILY_STATUS_MISSING,
    occurred_at_local: "",
  }});

  useEffect(() => {{
    if (!open || !person) {{
      return;
    }}
    setForm({{
      location: person.location || locationOptions[0] || "",
      daily_status: person.daily_status || DAILY_STATUS_MISSING,
      occurred_at_local: toLocalDateTimeInput(new Date()),
    }});
  }}, [open, person, locationOptions]);

  const safeEvents = Array.isArray(events) ? events : [];
  const safeTransitions = Array.isArray(transitions) ? transitions : [];
  const transitionByToEventId = useMemo(() => {{
    const mapping = new Map();
    safeTransitions.forEach((item) => {{
      mapping.set(String(item.to_event_id || ""), item);
    }});
    return mapping;
  }}, [safeTransitions]);

  if (!open || !person) {{
    return null;
  }}

  const handleSubmit = (event) => {{
    event.preventDefault();
    onAddEvent({{
      location: form.location,
      daily_status: form.daily_status,
      occurred_at: toUtcIsoFromLocalInput(form.occurred_at_local),
    }});
  }};

  return (
    <div className="modal-backdrop" onClick={{onClose}}>
      <div
        className="modal tracking-modal"
        onClick={{(event) => event.stopPropagation()}}
      >
        <h3>{{`{maakav_mikumi} - ${{person.full_name}}`}}</h3>

        {{latestTransitionWarning ? (
          <div className="tracking-warning">{{latestTransitionWarning}}</div>
        ) : null}}

        {{!readOnly ? (
          <form className="modal-form tracking-form" onSubmit={{handleSubmit}}>
            <label>
              {makom}
              <select
                value={{form.location}}
                onChange={{(event) =>
                  setForm((prev) => ({{ ...prev, location: event.target.value }}))
                }}
              >
                {{locationOptions.map((location) => (
                  <option key={{location}} value={{location}}>
                    {{location}}
                  </option>
                ))}}
              </select>
            </label>

            <label>
              {status}
              <select
                value={{form.daily_status}}
                onChange={{(event) =>
                  setForm((prev) => ({{
                    ...prev,
                    daily_status: event.target.value,
                  }}))
                }}
              >
                <option value={{DAILY_STATUS_OK}}>{takin}</option>
                <option value={{DAILY_STATUS_BAD}}>{lo_takin}</option>
                <option value={{DAILY_STATUS_MISSING}}>{lo_hoznan}</option>
              </select>
            </label>

            <label>
              {zman_irua}
              <input
                type="datetime-local"
                value={{form.occurred_at_local}}
                onChange={{(event) =>
                  setForm((prev) => ({{
                    ...prev,
                    occurred_at_local: event.target.value,
                  }}))
                }}
              />
            </label>

            <div className="modal-actions tracking-actions">
              <button
                type="submit"
                className="btn btn-primary"
                data-testid="tracking-add-event-button"
                disabled={{loading || !form.location}}
              >
                {hosaf_irua}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                data-testid="tracking-undo-button"
                disabled={{loading || !canUndo}}
                onClick={{onUndoLastAction}}
              >
                {{canUndo ? `{batel} (${{undoSecondsLeft}})` : "{batel}"}}
              </button>
            </div>
          </form>
        ) : (
          <div className="muted-text tracking-readonly-note">
            {readonly_note}
          </div>
        )}}

        <div className="tracking-events-list">
          <h4>{iruim}</h4>
          {{safeEvents.length === 0 ? (
            <div className="muted-text">{ein_iruim}</div>
          ) : (
            safeEvents.map((item) => {{
              const transition = transitionByToEventId.get(String(item.event_id));
              return (
                <div
                  className={{`tracking-event-row ${{item.is_voided ? "voided-event" : ""}}`}}
                  key={{item.event_id}}
                >
                  <div className="tracking-event-meta">
                    <strong>{{formatEventTimestamp(item.occurred_at)}}</strong>
                    <span className="status-chip neutral-chip">
                      {{`{sug}: ${{formatEventType(item.event_type)}}`}}
                    </span>
                    <span
                      className={{`status-chip ${{getLocationChipClass(item.location)}}`}}
                    >
                      {{`{makom}: ${{item.location}}`}}
                    </span>
                    <span
                      className={{`status-chip ${{getDailyStatusChipClass(
                        item.daily_status
                      )}}`}}
                    >
                      {{`{status}: ${{item.daily_status}}`}}
                    </span>
                    {{item.is_voided ? (
                      <span className="status-chip warning-chip">{namchak}</span>
                    ) : null}}
                  </div>
                  <div className="tracking-event-details">
                    {{transition ? (
                      <small>{{`{maavar_prefix}: {me_prefix}-${{transition.from_location}} {le_prefix}-${{transition.to_location}}`}}</small>
                    ) : item.event_type === "move" ? (
                      <small>{techilat_rezef}</small>
                    ) : null}}
                    <small>{{`{mazahe_irua}: ${{item.event_id}}`}}</small>
                  </div>
                  {{!readOnly && item.event_type === "move" && !item.is_voided ? (
                    <button
                      className="btn btn-danger btn-small"
                      onClick={{() => onDeleteEvent(item.event_id)}}
                      disabled={{loading}}
                    >
                      {mchak_irua}
                    </button>
                  ) : null}}
                </div>
              );
            }})
          )}}
        </div>

        <div className="tracking-transitions-list">
          <h4>{maavarim_mechushavim}</h4>
          {{safeTransitions.length === 0 ? (
            <div className="muted-text">{ein_maavarim}</div>
          ) : (
            safeTransitions.map((item) => (
              <div className="tracking-transition-row" key={{item.transition_id}}>
                <strong>{{`{me_prefix}-${{item.from_location}} {le_prefix}-${{item.to_location}}`}}</strong>
                <span>{{formatEventTimestamp(item.moved_at)}}</span>
                <span>{{`{shahiya}: ${{item.dwell_minutes}} {dakot}`}}</span>
              </div>
            ))
          )}}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={{onClose}}>
            {sagur}
          </button>
        </div>
      </div>
    </div>
  );
}}

export default PersonTrackingModal;
'''

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('Written successfully')
with open(filepath, 'rb') as f:
    data = f.read()
idx = data.find(b'return "')
print('formatEventType return bytes:', data[idx:idx+20])
idx2 = data.find(b'<h4>')
print('First h4 bytes:', data[idx2:idx2+20])
