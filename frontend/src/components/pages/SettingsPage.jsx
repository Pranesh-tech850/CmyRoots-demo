import React from "react";
import { User, Lock, Shield, Bell, ChevronRight, Save } from "lucide-react";

const SettingsPage = ({ currentUser, myEmail, emailInputRef, onSave }) => (
  <main className="page-content">
    <div className="page-title">
      <div>
        <h1>Settings</h1>
        <p>Manage your account preferences</p>
      </div>
    </div>

    <section className="settings-card">
      <div className="settings-section">
        <div className="settings-heading">
          <User size={21} />
          <div>
            <h2>Profile</h2>
            <p>Update your personal information</p>
          </div>
        </div>
        <div className="settings-form" key={`${currentUser}-${myEmail}`}>
          <div className="input-group">
            <label>Full Name</label>
            <input type="text" defaultValue={currentUser} />
          </div>
          <div className="input-group">
            <label>Email</label>
            <input type="email" defaultValue={myEmail} ref={emailInputRef} />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-heading">
          <Lock size={21} />
          <div>
            <h2>Security</h2>
            <p>Manage your account security</p>
          </div>
        </div>
        <button
          type="button"
          className="settings-option"
          onClick={() => alert("Password reset link sent.")}
        >
          <Shield size={20} />
          <div>
            <h3>Change Password</h3>
            <p>Update your account password</p>
          </div>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="settings-section">
        <div className="settings-heading">
          <Bell size={21} />
          <div>
            <h2>Notifications</h2>
            <p>Manage your notification preferences</p>
          </div>
        </div>
        <label className="notification-setting">
          <div><h3>Family Updates</h3><p>Receive updates about your family</p></div>
          <input type="checkbox" defaultChecked />
        </label>
        <label className="notification-setting">
          <div><h3>Messages</h3><p>Receive notifications for new messages</p></div>
          <input type="checkbox" defaultChecked />
        </label>
      </div>

      <button
        type="button"
        className="save-button"
        onClick={onSave}
      >
        <Save size={17} /> Save Changes
      </button>
    </section>
  </main>

);

export default SettingsPage;
