import React from "react";
import { UserPlus } from "lucide-react";
import "../../styles/MembersPage.css";

const MembersPage = ({
  members,
  searchTerm,
  currentUser,
  getMemberRelation,
  getMemberEmail,
  onlineUsers,
  memberLimit,
  setMemberLimit,
  onNavigate,
}) => {
  const q = searchTerm.toLowerCase();
  const filteredMembers = members
    .filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        getMemberRelation(m.name).toLowerCase().includes(q)
    )
    /* me first, then my relatives, then everyone else A-Z */
    .sort(
      (a, b) =>
        Number(b.name === currentUser) - Number(a.name === currentUser) ||
        Number(getMemberRelation(a.name) === "Not connected") -
          Number(getMemberRelation(b.name) === "Not connected") ||
        a.name.localeCompare(b.name)
    );
  const shownMembers = filteredMembers.slice(0, memberLimit);

  return (
    <main className="page-content mp">
      <div className="mp-head">
        <div>
          <h1>Family members</h1>
          <p>Everyone in your family network, and how you are related.</p>
        </div>
        <button type="button" className="mp-btn" onClick={() => onNavigate("tree")}>
          <UserPlus size={16} /> Add in tree
        </button>
      </div>

      <section className="mp-card">
        <div className="mp-cols mp-thead">
          <span>Member</span>
          <span>Relation</span>
          <span>Email</span>
          <span>Status</span>
        </div>

        {shownMembers.length === 0 && (
          <div className="mp-empty">No members match your search.</div>
        )}

        {shownMembers.map((member) => {
          const rel = getMemberRelation(member.name);
          const online = onlineUsers.includes(member.name);
          const relClass =
            rel === "You"
              ? "mp-rel mp-rel--you"
              : rel === "Not connected"
              ? "mp-rel mp-rel--none"
              : "mp-rel";

          return (
            <div className="mp-cols mp-row" key={member.name}>
              <div className="mp-person">
                <div className="mp-avatar">{member.avatar}</div>
                <span className="mp-name">{member.name}</span>
              </div>
              <span className={relClass}>{rel}</span>
              <span className="mp-email" title={getMemberEmail(member)}>
                {getMemberEmail(member)}
              </span>
              <span className={`mp-status${online ? " mp-status--on" : ""}`}>
                {online ? "Online" : "Offline"}
              </span>
            </div>
          );
        })}

        <div className="mp-foot">
          <span>
            Showing {shownMembers.length} of {filteredMembers.length}
          </span>
          {filteredMembers.length > shownMembers.length && (
            <button
              type="button"
              className="mp-btn mp-btn--ghost"
              onClick={() => setMemberLimit((n) => n + 25)}
            >
              Show 25 more
            </button>
          )}
        </div>
      </section>
    </main>
  );
};

export default MembersPage;