import { trpc } from "@servs/client";
import { useState } from "react";
import type { LogEntry } from "@serv/rlibs"

export const LogStreamViewer = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [levels, setLevels] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [limit] = useState(150);
  const [prevHistory, setPrevHistory] = useState<LogEntry[] | undefined>(undefined);

  trpc.logStream.useSubscription(
      { query: search, levels: levels.length ? levels : undefined },
      {
        onData(newLog) {
          if (isPaused) return;
          setLogs((prev) => [newLog, ...prev].slice(0, limit));
        },
      }
    );

  const toggleLevel = (level: string) => {
    setLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
    );
  };

  const { data: history } = trpc.getLogs.useQuery(
    { limit, query: search, levels },
    { 
      refetchInterval: false, 
      staleTime: Infinity 
    }
  );

  if (history && history !== prevHistory) {
    setPrevHistory(history);
    setLogs(history);
  }

  return (
    <section className="log-viewer-dark">
      <div className="log-header">
        <div className="search-wrapper">
          <input
            type="text"
            placeholder="Filter logs (e.g. redis* or Error)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="log-search-input"
          />
        </div>

        <div className="level-filters">
          {["ERROR", "WARN", "INFO", "DEBUG", "TRACE"].map((lvl) => (
            <button
              key={lvl}
              className={`level-btn ${levels.includes(lvl) ? "active" : ""}`}
              onClick={() => toggleLevel(lvl)}
            >
              {lvl}
            </button>
          ))}
        </div>

        <div className="time-range">
          <input
            type="text"
            placeholder="Start (YYYY-MM-DD HH:MM:SS)"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <span> – </span>
          <input
            type="text"
            placeholder="End (YYYY-MM-DD HH:MM:SS)"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>

        <button
          onClick={() => setIsPaused(!isPaused)}
          className={`control-btn ${isPaused ? "btn-resume" : "btn-pause"}`}
        >
          {isPaused ? "▶ RESUME" : "⏸ PAUSE"}
        </button>
      </div>

      <div className="terminal-window">
          <table className="terminal-table">
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>LEVEL</th>
                <th>SOURCE</th>
                <th>MESSAGE</th>
              </tr>
            </thead>
            <tbody>
              {logs?.map((log) => (
                <tr
                  key={log.id}
                  className={`log-row lvl-${log.level.toLowerCase()}`}
                >
                  <td className="col-time">{log.timestamp}</td>
                  <td className="col-lvl">
                    <span className="lvl-badge">{log.level}</span>
                  </td>
                  <td className="col-src">{log.source}</td>
                  <td className="col-msg">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </section>
  );
};
