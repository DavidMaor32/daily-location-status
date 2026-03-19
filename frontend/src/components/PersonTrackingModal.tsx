// Modal component for per-person location event tracking and undo workflow.
import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { getLocationChipClass } from "../constants/locations";
import {
  DAILY_STATUS_BAD,
  DAILY_STATUS_MISSING,
  DAILY_STATUS_OK,
  getDailyStatusChipClass,
} from "../constants/statuses";
import {
  formatTimestamp,
  toLocalDateTimeInput,
  toUtcIsoFromLocalInput,
} from "../utils/dates";
import { formatEventType, formatTransitionSource } from "../utils/tracking";

type TrackingPerson = {
  full_name: string;
  location?: string;
  daily_status?: string;
};

type TrackingFormState = {
  location: string;
  daily_status: string;
  occurred_at_local: string;
};

type TrackingEvent = {
  event_id: string;
  occurred_at?: string;
  event_type: string;
  location: string;
  daily_status: string;
  is_voided?: boolean;
};

type TrackingTransition = {
  transition_id: string;
  from_location: string;
  to_location: string;
  moved_at?: string;
  dwell_minutes: number;
  transition_source?: string;
  to_event_id?: string;
};

type AddTrackingEventPayload = {
  location: string;
  daily_status: string;
  occurred_at?: string;
};

type PersonTrackingModalProps = {
  open: boolean;
  person: TrackingPerson | null;
  readOnly: boolean;
  loading: boolean;
  locationOptions: string[];
  events: TrackingEvent[];
  transitions: TrackingTransition[];
  latestTransitionWarning: string;
  canUndo: boolean;
  undoSecondsLeft: number;
  onClose: () => void;
  onAddEvent: (payload: AddTrackingEventPayload) => void;
  onDeleteEvent: (eventId: string) => void;
  onUndoLastAction: () => void;
};

const PersonTrackingModal = (props: PersonTrackingModalProps) => {
  const {
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
  } = props;

  const [form, setForm] = useState<TrackingFormState>({
    location: "",
    daily_status: DAILY_STATUS_MISSING,
    occurred_at_local: "",
  });

  useEffect(() => {
    if (!open || !person) {
      return;
    }
    setForm({
      location: person.location || locationOptions[0] || "",
      daily_status: person.daily_status || DAILY_STATUS_MISSING,
      occurred_at_local: toLocalDateTimeInput(new Date()),
    });
  }, [open, person, locationOptions]);

  const safeEvents = Array.isArray(events) ? events : [];
  const safeTransitions = Array.isArray(transitions) ? transitions : [];
  const transitionByToEventId = useMemo(() => {
    const mapping = new Map<string, TrackingTransition>();
    safeTransitions.forEach((item) => {
      mapping.set(String(item.to_event_id || ""), item);
    });
    return mapping;
  }, [safeTransitions]);

  if (!open || !person) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onAddEvent({
      location: form.location,
      daily_status: form.daily_status,
      occurred_at: toUtcIsoFromLocalInput(form.occurred_at_local),
    });
  };

  const handleModalClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal tracking-modal" onClick={handleModalClick}>
        <h3>{`מעקב מיקומי - ${person.full_name}`}</h3>

        {latestTransitionWarning ? (
          <div className="tracking-warning">{latestTransitionWarning}</div>
        ) : null}

        {/* extract modal to component */}
        {!readOnly ? (
          <form className="modal-form tracking-form" onSubmit={handleSubmit}>
            <label>
              מיקום
              <select
                value={form.location}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, location: event.target.value }))
                }
              >
                {locationOptions.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>

            <label>
              סטטוס
              <select
                value={form.daily_status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    daily_status: event.target.value,
                  }))
                }
              >
                <option value={DAILY_STATUS_OK}>תקין</option>
                <option value={DAILY_STATUS_BAD}>לא תקין</option>
                <option value={DAILY_STATUS_MISSING}>לא הוזן</option>
              </select>
            </label>

            <label>
              זמן אירוע
              <input
                type="datetime-local"
                value={form.occurred_at_local}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    occurred_at_local: event.target.value,
                  }))
                }
              />
            </label>

            <div className="modal-actions tracking-actions">
              <button
                type="submit"
                className="btn btn-primary"
                data-testid="tracking-add-event-button"
                disabled={loading || !form.location}
              >
                הוסף אירוע
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                data-testid="tracking-undo-button"
                disabled={loading || !canUndo}
                onClick={onUndoLastAction}
              >
                {canUndo ? `בטל (${undoSecondsLeft})` : "בטל"}
              </button>
            </div>
          </form>
        ) : (
          <div className="muted-text tracking-readonly-note">
            תצוגת היסטוריה בלבד. הוספה ומחיקה זמינות רק ביום הנוכחי.
          </div>
        )}

        <div className="tracking-events-list">
          <h4>אירועים</h4>
          {safeEvents.length === 0 ? (
            <div className="muted-text">אין אירועי מיקום למזהה זה בתאריך שנבחר.</div>
          ) : (
            // extract to component
            safeEvents.map((item) => {
              const transition = transitionByToEventId.get(String(item.event_id));
              return (
                <div
                  className={`tracking-event-row ${item.is_voided ? "voided-event" : ""}`}
                  key={item.event_id}
                >
                  <div className="tracking-event-meta">
                    <strong>{formatTimestamp(item.occurred_at)}</strong>
                    <span className="status-chip neutral-chip">
                      {`סוג: ${formatEventType(item.event_type)}`}
                    </span>
                    <span
                      className={`status-chip ${getLocationChipClass(item.location)}`}
                    >
                      {`מיקום: ${item.location}`}
                    </span>
                    <span
                      className={`status-chip ${getDailyStatusChipClass(
                        item.daily_status
                      )}`}
                    >
                      {`סטטוס: ${item.daily_status}`}
                    </span>
                    {item.is_voided ? (
                      <span className="status-chip warning-chip">נמחק</span>
                    ) : null}
                  </div>
                  <div className="tracking-event-details">
                    {transition ? (
                      <small>
                        {`מעבר: מ-${transition.from_location} ל-${transition.to_location} | מקור: ${formatTransitionSource(
                          transition.transition_source
                        )}`}
                      </small>
                    ) : item.event_type === "move" ? (
                      <small>תחילת רצף (אין מעבר קודם)</small>
                    ) : null}
                    <small>{`מזהה אירוע: ${item.event_id}`}</small>
                  </div>
                  {!readOnly && item.event_type === "move" && !item.is_voided ? (
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => onDeleteEvent(item.event_id)}
                      disabled={loading}
                    >
                      מחק אירוע
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="tracking-transitions-list">
          <h4>מעברים מחושבים</h4>
          {safeTransitions.length === 0 ? (
            <div className="muted-text">אין מעברים מחושבים לתאריך זה.</div>
          ) : (
            safeTransitions.map((item) => (
              <div className="tracking-transition-row" key={item.transition_id}>
                <strong>{`מ-${item.from_location} ל-${item.to_location}`}</strong>
                <span>{formatTimestamp(item.moved_at)}</span>
                <span>{`שהייה: ${item.dwell_minutes} דקות`}</span>
                <span>{`מקור מעבר: ${formatTransitionSource(item.transition_source)}`}</span>
              </div>
            ))
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            סגור
          </button>
        </div>
      </div>
    </div>
  );
};

export default PersonTrackingModal;
