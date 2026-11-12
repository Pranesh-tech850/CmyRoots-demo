import React from "react";
import { Search, Bell, ChevronDown } from "lucide-react";

const Topbar = ({
  searchTerm,
  setSearchTerm,
  totalUnread,
  onNavigate,
  currentUser,
  currentUserAvatar,
  myEmail,
  profileDropdownOpen,
  setProfileDropdownOpen,
  logout,
}) => (
  <header className="topbar">
    <div className="search-box">
      <Search size={21} />
      <input
        type="text"
        placeholder="Search family members..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>

    <div className="topbar-right">
      <div
        className="notification"
        title="Notifications"
        onClick={() => onNavigate("messages")}
      >
        <Bell size={23} />
        {totalUnread > 0 && (
          <span className="notification-badge">{totalUnread}</span>
        )}
      </div>

      <div
        className="profile"
        style={{ position: "relative", cursor: "pointer", userSelect: "none" }}
        onClick={(e) => {
          e.stopPropagation();
          setProfileDropdownOpen((prev) => !prev);
        }}
      >
        <div className="profile-avatar">{currentUserAvatar}</div>
        <span style={{ fontWeight: 600, fontSize: "14px" }}>{currentUser}</span>
        <ChevronDown size={17} />

        {profileDropdownOpen && (
          <div
            className="profile-dropdown-menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="profile-dropdown-header">
              <strong>{currentUser}</strong>
              <small>{myEmail}</small>
            </div>
            <div className="profile-dropdown-divider" />
            <button
              type="button"
              className="profile-dropdown-item logout"
              onClick={() => {
                setProfileDropdownOpen(false);
                logout();
              }}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  </header>
);

export default Topbar;