
import React, { useEffect, useState } from "react";
import { invoke } from "@forge/bridge";
import "./App.css";

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [investigating, setInvestigating] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [investigation, setInvestigation] = useState(null);
  const [investigationError, setInvestigationError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);

        const result = await invoke("getDashboardData");

        if (!result.success) {
          throw new Error(result.error || "Unable to load dashboard");
        }

        setDashboard(result);
        setError("");
      } catch (err) {
        console.error("IncidentIQ:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  async function investigateIssue(issue) {
    try {
      setInvestigating(true);
      setSelectedIssue(issue);
      setInvestigation(null);
      setInvestigationError("");

      const result = await invoke("getLinkedIssues", {
        issueKey: issue.key,
      });

      if (!result.success) {
        throw new Error(result.error || "Investigation failed");
      }

      setInvestigation(result);
    } catch (err) {
      console.error("IncidentIQ investigation:", err);
      setInvestigationError(err.message);
    } finally {
      setInvestigating(false);
    }
  }

  const stats = [
    {
      title: "Total Issues",
      value: dashboard?.stats?.totalIssues ?? 0,
      icon: "📋",
    },
    {
      title: "Critical Issues",
      value: dashboard?.stats?.criticalIssues ?? 0,
      icon: "🚨",
    },
    {
      title: "Open Issues",
      value: dashboard?.stats?.openIssues ?? 0,
      icon: "🔵",
    },
    {
      title: "Resolved Issues",
      value: dashboard?.stats?.resolvedIssues ?? 0,
      icon: "✅",
    },
  ];

  return (
    <div className="incidentiq">
      <header className="topbar">
        <div>
          <h1>IncidentIQ</h1>
          <p>Incident Intelligence & Resolution Platform</p>
        </div>
        <span className="status">● Development</span>
      </header>

      <section className="welcome">
        <h2>Incident Command Center</h2>
        <p>Project: {dashboard?.projectKey || "Loading..."}</p>
      </section>

      {loading && <p>Loading Jira data...</p>}

      {error && (
        <div className="panel">
          <strong>Unable to load Jira data</strong>
          <p>{error}</p>
        </div>
      )}

      <section className="stats">
        {stats.map((item) => (
          <div className="stat-card" key={item.title}>
            <span className="stat-icon">{item.icon}</span>
            <p>{item.title}</p>
            <h2>{loading ? "..." : item.value}</h2>
          </div>
        ))}
      </section>

      <section className="content">
        <div className="panel">
          <h3>Recent Issues</h3>

          {dashboard?.recentIssues?.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Summary</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {dashboard.recentIssues.map((issue) => (
                  <tr key={issue.id}>
                    <td>{issue.key}</td>
                    <td>{issue.summary}</td>
                    <td>{issue.priority}</td>
                    <td>{issue.status}</td>
                    <td>{issue.assignee}</td>
                    <td>
                      <button
                        className="investigate-button"
                        onClick={() => investigateIssue(issue)}
                        disabled={investigating}
                      >
                        {investigating && selectedIssue?.key === issue.key
                          ? "Investigating..."
                          : "Investigate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            !loading && <p>No issues found in this project.</p>
          )}
        </div>

        <div className="panel">
          <h3>AI Investigation</h3>

          {!selectedIssue && (
            <div className="ai-box">
              <span>✦</span>
              <h4>Incident intelligence</h4>
              <p>
                Select Investigate on an incident to discover
                related engineering issues and evidence.
              </p>
              <span className="coming-soon">
                Correlation engine
              </span>
            </div>
          )}

          {selectedIssue && (
            <div className="investigation-results">
              <h4>Investigation: {selectedIssue.key}</h4>
              <p>{selectedIssue.summary}</p>

              {investigating && (
                <p>Discovering linked Jira issues...</p>
              )}

              {investigationError && (
                <div className="investigation-error">
                  <strong>Investigation failed</strong>
                  <p>{investigationError}</p>
                </div>
              )}

              {investigation && (
                <>
                  <p>
                    <strong>Related issues found:</strong>{" "}
                    {investigation.total}
                  </p>

                  {investigation.linkedIssues.length > 0 ? (
                    <div className="linked-issues">
                      {investigation.linkedIssues.map((linkedIssue) => (
                        <div
                          className="linked-issue-card"
                          key={`${linkedIssue.key}-${linkedIssue.linkType}`}
                        >
                          <div className="linked-issue-header">
                            <strong>{linkedIssue.key}</strong>
                            <span>{linkedIssue.linkType}</span>
                          </div>

                          <p>{linkedIssue.summary}</p>

                          <div className="linked-issue-meta">
                            <span>{linkedIssue.issueType}</span>
                            <span>{linkedIssue.priority}</span>
                            <span>{linkedIssue.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No linked issues found for this incident.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <footer>
        IncidentIQ · From Incident to Insight.
        From Insight to Resolution.
      </footer>
    </div>
  );
}

export default App;
