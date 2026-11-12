import React from "react";

const UserPicker = ({ members, pickerSearch, setPickerSearch, chooseUser }) => {
  const pq = pickerSearch.trim().toLowerCase();
  const matches = members.filter((m) => m.name.toLowerCase().includes(pq));
  return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <h2>Who are you?</h2>
      <p>Pick a family member for this browser tab ({members.length} members)</p>
      <input
        type="text"
        autoFocus
        placeholder="Search by name..."
        value={pickerSearch}
        onChange={(e) => setPickerSearch(e.target.value)}
        style={{ padding: "10px 14px", width: 280, marginTop: 12, borderRadius: 8, border: "1px solid #d1d5db" }}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          justifyContent: "center",
          marginTop: 20,
          maxWidth: 760,
          marginInline: "auto",
        }}
      >
        {matches.slice(0, 40).map((m) => (
          <button
            key={m.name}
            type="button"
            className="black-button"
            onClick={() => {
              setPickerSearch("");
              chooseUser(m.name);
            }}
          >
            {m.avatar} {m.name}
          </button>
        ))}
      </div>
      {matches.length > 40 && (
        <p style={{ opacity: 0.6, fontSize: 13, marginTop: 14 }}>
          Showing 40 of {matches.length}. Type to narrow the list.
        </p>
      )}
      {matches.length === 0 && <p style={{ opacity: 0.6 }}>No member found</p>}
    </div>
  );
};

export default UserPicker;
