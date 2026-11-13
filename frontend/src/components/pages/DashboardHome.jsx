import React from "react";
import { Users, Network, ChevronRight } from "lucide-react";

const DashboardHome = ({
  currentUser,
  currentUserAvatar,
  memberCount,
  connectionCount,
  onNavigate,
}) => {
  return (
    <main className="page-content">
      <section className="welcome-section">
        <div>
          <p className="welcome-small">Welcome back,</p>
          <h1>{currentUser}</h1>
          <p className="welcome-description">Your family network is growing</p>
        </div>
        <div className="welcome-avatar">{currentUserAvatar}</div>
      </section>

      <section className="stats-container">
        <div className="stat-card">
          <div className="stat-title"><Users size={21} /><span>Family Members</span></div>
          <h2>{memberCount}</h2>
          <p>Active in tree</p>
        </div>
        <div className="stat-card">
          <div className="stat-title"><Network size={21} /><span>Connections</span></div>
          <h2>{connectionCount}</h2>
          <p>Relationships tracked</p>
        </div>

      </section>

      <section className="activity-section">
        <div className="section-header">
          <h2>Recent Activity</h2>
          <button type="button" onClick={() => onNavigate("tree")}>
            View tree <ChevronRight size={17} />
          </button>
        </div>
        <div className="activity-list">
          <div className="activity-item">
            <div className="activity-avatar">{currentUserAvatar}</div>
            <div className="activity-info">
              <p>
                {memberCount > 1
                  ? "Open your tree to see your family and send messages."
                  : "Nothing here yet. Open the Tree page and add your first relative."}
              </p>
              <span>Just now</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default DashboardHome;