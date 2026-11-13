
import React from "react";
import {
  UserRound,
  Camera,
  CalendarDays,
  ChevronRight,
  Pencil,
  Crown,
} from "lucide-react";

import "./SettingsPage.css";

const SettingsPage = ({
  currentUser,
  myEmail,
  emailInputRef,
  onSave,
  onOpenProfile,
  onCreateEvent,
  profileImage,
}) => {
  const handleEdit = () => {
    if (onOpenProfile) {
      onOpenProfile();
    }
  };

  return (
    <main className="settings-page">

      {/* Profile Header */}
      <section className="settings-profile-header">

        <div className="settings-avatar-wrapper">
          {profileImage ? (
            <img
              src={profileImage}
              alt="Profile"
              className="settings-avatar"
            />
          ) : (
            <div className="settings-avatar settings-avatar-placeholder">
              <UserRound size={42} />
            </div>
          )}

          <button
            type="button"
            className="settings-camera-button"
            aria-label="Change profile picture"
            onClick={handleEdit}
          >
            <Camera size={17} />
          </button>
        </div>

        <div className="settings-profile-info">
          <h1>{currentUser || "Your Name"}</h1>

          <p ref={emailInputRef}>
            {myEmail || "your-email@example.com"}
          </p>

          <span className="settings-premium-badge">
            <Crown size={14} />
            Premium Member
          </span>
        </div>

        <button
          type="button"
          className="settings-edit-button"
          onClick={handleEdit}
        >
          <Pencil size={15} />
          Edit
        </button>

      </section>

      {/* Event Section */}
      <section className="settings-navigation-section">

        <h2 className="settings-section-title">
          Event
        </h2>

        <button
          type="button"
          className="settings-navigation-item"
          onClick={onCreateEvent}
        >
          <div className="settings-item-icon">
            <CalendarDays size={23} />
          </div>

          <div className="settings-item-content">
            <h3>Create Event</h3>
            <p>Plan, invite, and celebrate</p>
          </div>

          <ChevronRight
            size={23}
            className="settings-chevron"
          />
        </button>

      </section>

      {/* Account Section */}
      <section className="settings-navigation-section">

        <h2 className="settings-section-title">
          Account
        </h2>

        <button
          type="button"
          className="settings-navigation-item"
          onClick={handleEdit}
        >
          <div className="settings-item-icon">
            <UserRound size={23} />
          </div>

          <div className="settings-item-content">
            <h3>My Profile</h3>
            <p>Name, DOB, contact details</p>
          </div>

          <ChevronRight
            size={23}
            className="settings-chevron"
          />
        </button>

      </section>

    </main>
  );
};

export default SettingsPage;
