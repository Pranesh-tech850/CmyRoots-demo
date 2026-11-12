import React from "react";
import { Users, Network, ChevronRight, CalendarDays, Plus } from "lucide-react";

const recentActivities = [
    { name: "Robert", text: "Robert uploaded 5 photos from Easter Sunday", time: "2 hours ago", avatar: "👨🏻" },
    { name: "Linda",  text: "Linda added a new tradition: Sunday Morning Pancakes", time: "Yesterday", avatar: "👩🏻" },
    { name: "Mike",   text: "Mike shared a new document: Family Tree Chart", time: "3 days ago", avatar: "👦🏻" },
];

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
          {recentActivities.map((activity, index) => (
            <div className="activity-item" key={index}>
              <div className="activity-avatar">{activity.avatar}</div>
              <div className="activity-info">
                <p>{activity.text}</p>
                <span>{activity.time}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="birthday-card">
        <div className="birthday-date">
          <CalendarDays size={20} />
          <span>MAY</span><strong>15</strong><small>2026</small>
        </div>
        <div className="birthday-content">
          <div className="birthday-top">
            <div className="birthday-label"><CalendarDays size={15} />Birthday</div>
            <span>5 days</span>
          </div>
          <h2>Uncle James turns 65</h2>
          <p>Create an event, invite family members and surprise uncle James</p>
          <button
            type="button"
            className="create-event-btn"
            onClick={() => alert("Birthday event created!")}
          >
            <Plus size={17} /> Create Event
          </button>
        </div>
      </section>
    </main>
  );
};

export default DashboardHome;
