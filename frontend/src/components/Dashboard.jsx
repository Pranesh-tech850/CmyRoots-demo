import React, { useState } from "react";

import {
  LayoutDashboard,
  Network,
  MessageSquare,
  Users,
  Settings,
  Search,
  Bell,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Plus,
  UserPlus,
  Send,
  Shield,
  Lock,
  User,
  Save,
} from "lucide-react";

import "../styles/Dashboard.css";

// Tree page
import TreePage from "./tree/TreePage";


const Dashboard = () => {

  const [activePage, setActivePage] = useState("dashboard");


  /* =====================================
     SIDEBAR ITEMS
  ===================================== */

  const menuItems = [
    {
      name: "Dashboard",
      icon: <LayoutDashboard size={21} />,
      page: "dashboard",
    },
    {
      name: "Tree",
      icon: <Network size={21} />,
      page: "tree",
    },
    {
      name: "Messages",
      icon: <MessageSquare size={21} />,
      page: "messages",
    },
    {
      name: "Members",
      icon: <Users size={21} />,
      page: "members",
    },
    {
      name: "Settings",
      icon: <Settings size={21} />,
      page: "settings",
    },
  ];


  /* =====================================
     DASHBOARD DATA
  ===================================== */

  const recentActivities = [
    {
      name: "Robert",
      text: "Robert uploaded 5 photos from Easter Sunday",
      time: "2 hours ago",
      avatar: "👨🏻",
    },
    {
      name: "Linda",
      text: "Linda added a new tradition: Sunday Morning Pancakes",
      time: "Yesterday",
      avatar: "👩🏻",
    },
    {
      name: "Mike",
      text: "Mike shared a new document: Family Tree Chart",
      time: "3 days ago",
      avatar: "👨🏻",
    },
  ];


  /* =====================================
     MESSAGE DATA
  ===================================== */

  const messages = [
    {
      name: "Linda",
      message: "Are we meeting this Sunday?",
      time: "10:30 AM",
      avatar: "👩🏻",
      unread: true,
    },
    {
      name: "Robert",
      message: "I uploaded the Easter photos.",
      time: "Yesterday",
      avatar: "👨🏻",
      unread: false,
    },
    {
      name: "Mike",
      message: "Can you check the family tree?",
      time: "Yesterday",
      avatar: "👦🏻",
      unread: false,
    },
    {
      name: "James",
      message: "Happy birthday everyone!",
      time: "2 days ago",
      avatar: "👴🏻",
      unread: false,
    },
  ];


  /* =====================================
     MEMBERS DATA
  ===================================== */

  const members = [
    {
      name: "Sarah",
      relation: "You",
      email: "sarah@example.com",
      status: "Active",
      avatar: "👩🏻",
    },
    {
      name: "Robert",
      relation: "Father",
      email: "robert@example.com",
      status: "Active",
      avatar: "👨🏻",
    },
    {
      name: "Linda",
      relation: "Mother",
      email: "linda@example.com",
      status: "Active",
      avatar: "👩🏻",
    },
    {
      name: "Mike",
      relation: "Brother",
      email: "mike@example.com",
      status: "Active",
      avatar: "👦🏻",
    },
  ];


  /* =====================================
     DASHBOARD PAGE
  ===================================== */

  const DashboardPage = () => {

    return (

      <main className="page-content">

        {/* WELCOME */}

        <section className="welcome-section">

          <div>

            <p className="welcome-small">
              Welcome back,
            </p>

            <h1>
              Sarah
            </h1>

            <p className="welcome-description">
              Your family network is growing
            </p>

          </div>

          <div className="welcome-avatar">
            👩🏻
          </div>

        </section>


        {/* STATISTICS */}

        <section className="stats-container">

          <div className="stat-card">

            <div className="stat-title">

              <Users size={21} />

              <span>
                Family Members
              </span>

            </div>

            <h2>
              247
            </h2>

            <p>
              +12 this month
            </p>

          </div>


          <div className="stat-card">

            <div className="stat-title">

              <Network size={21} />

              <span>
                Connections
              </span>

            </div>

            <h2>
              1264
            </h2>

            <p>
              +12 this month
            </p>

          </div>

        </section>


        {/* RECENT ACTIVITY */}

        <section className="activity-section">

          <div className="section-header">

            <h2>
              Recent Activity
            </h2>

            <button>

              View all

              <ChevronRight size={17} />

            </button>

          </div>


          <div className="activity-list">

            {recentActivities.map(
              (activity, index) => (

                <div
                  className="activity-item"
                  key={index}
                >

                  <div className="activity-avatar">
                    {activity.avatar}
                  </div>

                  <div className="activity-info">

                    <p>
                      {activity.text}
                    </p>

                    <span>
                      {activity.time}
                    </span>

                  </div>

                </div>

              )
            )}

          </div>

        </section>


        {/* BIRTHDAY */}

        <section className="birthday-card">

          <div className="birthday-date">

            <CalendarDays size={20} />

            <span>
              MAY
            </span>

            <strong>
              15
            </strong>

            <small>
              2026
            </small>

          </div>


          <div className="birthday-content">

            <div className="birthday-top">

              <div className="birthday-label">

                <CalendarDays size={15} />

                Birthday

              </div>

              <span>
                5 days
              </span>

            </div>


            <h2>
              Uncle James turns 65
            </h2>


            <p>
              Create an event, invite family members
              and surprise uncle James
            </p>


            <button className="create-event-btn">

              <Plus size={17} />

              Create Event

            </button>

          </div>

        </section>

      </main>

    );

  };


  /* =====================================
     MESSAGES PAGE
  ===================================== */

  const MessagesPage = () => {

    return (

      <main className="page-content">

        <div className="page-title">

          <div>

            <h1>
              Messages
            </h1>

            <p>
              Stay connected with your family
            </p>

          </div>


          <button className="black-button">

            <Send size={17} />

            New Message

          </button>

        </div>


        <section className="messages-card">

          {messages.map(
            (message, index) => (

              <div
                className="message-item"
                key={index}
              >

                <div className="message-avatar">
                  {message.avatar}
                </div>


                <div className="message-content">

                  <div className="message-name">

                    <h3>
                      {message.name}
                    </h3>

                    {message.unread && (
                      <span className="unread-dot"></span>
                    )}

                  </div>


                  <p>
                    {message.message}
                  </p>

                </div>


                <span className="message-time">
                  {message.time}
                </span>

              </div>

            )
          )}

        </section>

      </main>

    );

  };


  /* =====================================
     MEMBERS PAGE
  ===================================== */

  const MembersPage = () => {

    return (

      <main className="page-content">

        <div className="page-title">

          <div>

            <h1>
              Family Members
            </h1>

            <p>
              Manage everyone in your family network
            </p>

          </div>


          <button className="black-button">

            <UserPlus size={18} />

            Add Member

          </button>

        </div>


        <section className="members-card">

          <div className="members-table-header">

            <span>
              Member
            </span>

            <span>
              Relation
            </span>

            <span>
              Email
            </span>

            <span>
              Status
            </span>

          </div>


          {members.map(
            (member, index) => (

              <div
                className="members-row"
                key={index}
              >

                <div className="member-name-cell">

                  <div className="member-avatar">
                    {member.avatar}
                  </div>

                  <div>

                    <h3>
                      {member.name}
                    </h3>

                    <p>
                      {member.relation}
                    </p>

                  </div>

                </div>


                <span>
                  {member.relation}
                </span>


                <span>
                  {member.email}
                </span>


                <span className="status">
                  {member.status}
                </span>

              </div>

            )
          )}

        </section>

      </main>

    );

  };


  /* =====================================
     SETTINGS PAGE
  ===================================== */

  const SettingsPage = () => {

    return (

      <main className="page-content">

        <div className="page-title">

          <div>

            <h1>
              Settings
            </h1>

            <p>
              Manage your account preferences
            </p>

          </div>

        </div>


        <section className="settings-card">


          {/* PROFILE */}

          <div className="settings-section">

            <div className="settings-heading">

              <User size={21} />

              <div>

                <h2>
                  Profile
                </h2>

                <p>
                  Update your personal information
                </p>

              </div>

            </div>


            <div className="settings-form">

              <div className="input-group">

                <label>
                  Full Name
                </label>

                <input
                  type="text"
                  defaultValue="Sarah"
                />

              </div>


              <div className="input-group">

                <label>
                  Email
                </label>

                <input
                  type="email"
                  defaultValue="sarah@example.com"
                />

              </div>

            </div>

          </div>


          {/* SECURITY */}

          <div className="settings-section">

            <div className="settings-heading">

              <Lock size={21} />

              <div>

                <h2>
                  Security
                </h2>

                <p>
                  Manage your account security
                </p>

              </div>

            </div>


            <button className="settings-option">

              <Shield size={20} />

              <div>

                <h3>
                  Change Password
                </h3>

                <p>
                  Update your account password
                </p>

              </div>

              <ChevronRight size={18} />

            </button>

          </div>


          {/* NOTIFICATIONS */}

          <div className="settings-section">

            <div className="settings-heading">

              <Bell size={21} />

              <div>

                <h2>
                  Notifications
                </h2>

                <p>
                  Manage your notification preferences
                </p>

              </div>

            </div>


            <label className="notification-setting">

              <div>

                <h3>
                  Family Updates
                </h3>

                <p>
                  Receive updates about your family
                </p>

              </div>

              <input
                type="checkbox"
                defaultChecked
              />

            </label>


            <label className="notification-setting">

              <div>

                <h3>
                  Messages
                </h3>

                <p>
                  Receive notifications for new messages
                </p>

              </div>

              <input
                type="checkbox"
                defaultChecked
              />

            </label>

          </div>


          <button className="save-button">

            <Save size={17} />

            Save Changes

          </button>

        </section>

      </main>

    );

  };


  /* =====================================
     PAGE SWITCHER
  ===================================== */

  const renderPage = () => {

    switch (activePage) {

      case "dashboard":

        return <DashboardPage />;


      case "tree":

        return <TreePage />;


      case "messages":

        return <MessagesPage />;


      case "members":

        return <MembersPage />;


      case "settings":

        return <SettingsPage />;


      default:

        return <DashboardPage />;

    }

  };


  /* =====================================
     MAIN RETURN
  ===================================== */

  return (

    <div className="dashboard-layout">


      {/* =================================
          SIDEBAR
      ================================= */}

      <aside className="sidebar">


        {/* LOGO */}

        <div className="logo-section">

          <div className="logo-icon">

            <Users size={30} />

          </div>

          <h2>
            FamilyTree
          </h2>

        </div>


        {/* MENU */}

        <nav className="sidebar-menu">

          {menuItems.map(
            (item) => (

              <button
                key={item.page}
                className={`sidebar-item ${
                  activePage === item.page
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setActivePage(item.page)
                }
              >

                {item.icon}


                <span>
                  {item.name}
                </span>


                {item.page === "messages" && (

                  <span className="message-dot"></span>

                )}

              </button>

            )
          )}

        </nav>


        {/* SIDEBAR BOTTOM */}

        <div className="sidebar-bottom">

          <Network size={24} />

          <p>

            Stronger
            <br />

            Together

            <span>
              ♥
            </span>

          </p>

        </div>

      </aside>


      {/* =================================
          MAIN AREA
      ================================= */}

      <div className="main-area">


        {/* =================================
            TOP BAR
        ================================= */}

        <header className="topbar">


          {/* SEARCH */}

          <div className="search-box">

            <Search size={21} />

            <input
              type="text"
              placeholder="Search family members..."
            />

          </div>


          {/* TOPBAR RIGHT */}

          <div className="topbar-right">


            {/* NOTIFICATION */}

            <div className="notification">

              <Bell size={23} />

              <span></span>

            </div>


            {/* PROFILE */}

            <div className="profile">

              <div className="profile-avatar">
                👩🏻
              </div>

              <ChevronDown size={17} />

            </div>

          </div>

        </header>


        {/* =================================
            CURRENT PAGE
        ================================= */}

        {renderPage()}

      </div>

    </div>

  );

};


export default Dashboard;