import React from "react";
import {
  LayoutDashboard,
  Network,
  MessageSquare,
  Users,
  Settings,
} from "lucide-react";

const menuItems = [
  { name: "Dashboard", icon: <LayoutDashboard size={21} />, page: "dashboard" },
  { name: "Tree",      icon: <Network size={21} />,         page: "tree" },
  { name: "Messages",  icon: <MessageSquare size={21} />,   page: "messages" },
  { name: "Members",   icon: <Users size={21} />,           page: "members" },
  { name: "Settings",  icon: <Settings size={21} />,        page: "settings" },
];

const Sidebar = ({ activePage, onNavigate, totalUnread }) => (
  <aside className="sidebar">
    <div className="logo-section">
      <div className="logo-icon"><Users size={30} /></div>
      <h2>FamilyTree</h2>
    </div>

    <nav className="sidebar-menu">
      {menuItems.map((item) => (
        <button
          key={item.page}
          type="button"
          className={`sidebar-item ${activePage === item.page ? "active" : ""}`}
          onClick={() => onNavigate(item.page)}
        >
          {item.icon}
          <span>{item.name}</span>
          {item.page === "messages" && totalUnread > 0 && (
            <span className="message-dot"></span>
          )}
        </button>
      ))}
    </nav>

    <div className="sidebar-bottom">
      <Network size={24} />
      <p>Stronger<br />Together<span> ♥</span></p>
    </div>
  </aside>
);

export default Sidebar;
