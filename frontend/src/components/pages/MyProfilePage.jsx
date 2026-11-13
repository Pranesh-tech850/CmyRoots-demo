
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CalendarDays,
  MapPin,
  UserRound,
  BriefcaseBusiness,
  Globe,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";

import "./MyProfilePage.css";

const initialForm = {
  name: "",
  dateOfBirth: "",
  birthplace: "",
  dateOfPassing: "",
  placeOfPassing: "",
  gender: "",
  occupation: "",
  nationality: "",
  profilePicture: "",
};

const MyProfilePage = ({ currentUser, myEmail, onBack }) => {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [isEditing, setIsEditing] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const fileInputRef = useRef(null);

  const storageKey = `my-profile-${myEmail || currentUser || "user"}`;

  useEffect(() => {
    const savedProfile = localStorage.getItem(storageKey);

    if (savedProfile) {
      try {
        const parsedProfile = JSON.parse(savedProfile);
        setProfile(parsedProfile);
        setForm(parsedProfile);
        setImagePreview(parsedProfile.profilePicture || "");
      } catch (error) {
        console.error("Unable to load profile:", error);
      }
    }
  }, [storageKey]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image.");
      return;
    }

    // Keep the image small enough for localStorage.
    if (file.size > 1.5 * 1024 * 1024) {
      alert("Please select an image smaller than 1.5 MB.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = reader.result;
      setImagePreview(image);
      setForm((prev) => ({
        ...prev,
        profilePicture: image,
      }));
    };

    reader.readAsDataURL(file);
  };

  const handleSave = (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      alert("Please enter your name.");
      return;
    }

    try {
      const profileData = {
        ...form,
        name: form.name.trim(),
      };

      localStorage.setItem(storageKey, JSON.stringify(profileData));

      setProfile(profileData);
      setForm(profileData);
      setIsEditing(false);
    } catch (error) {
      console.error("Unable to save profile:", error);
      alert("Could not save your profile. Try a smaller profile picture.");
    }
  };

  const handleEdit = () => {
    setForm(profile || initialForm);
    setImagePreview(profile?.profilePicture || "");
    setIsEditing(true);
  };

  const handleCancel = () => {
    setForm(profile || initialForm);
    setImagePreview(profile?.profilePicture || "");
    setIsEditing(false);
  };

  const formatDate = (date) => {
    if (!date) return "Not provided";

    return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // Profile creation / editing form
  if (!profile || isEditing) {
    return (
      <div className="my-profile-page">
        <div className="profile-page-header">
          <button className="profile-back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
            Back to Settings
          </button>

          <div>
            <h2>{profile ? "Edit Profile" : "Create Profile"}</h2>
            <p>Add your personal information to your family profile.</p>
          </div>
        </div>

        <form className="profile-form" onSubmit={handleSave}>
          <div className="profile-image-upload">
            <div className="profile-image-preview">
              {imagePreview ? (
                <img src={imagePreview} alt="Profile preview" />
              ) : (
                <UserRound size={42} />
              )}
            </div>

            <button
              type="button"
              className="profile-camera-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera size={16} />
              Upload photo
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleImageChange}
            />
          </div>

          <div className="profile-form-section">
            <h3>Personal Information</h3>

            <div className="profile-form-grid">
              <div className="profile-field full-width">
                <label>Full Name *</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Enter full name"
                  required
                />
              </div>

              <div className="profile-field">
                <label>Date of Birth</label>
                <input
                  type="date"
                  name="dateOfBirth"
                  value={form.dateOfBirth}
                  onChange={handleChange}
                />
              </div>

              <div className="profile-field">
                <label>Gender</label>
                <select
                  name="gender"
                  value={form.gender}
                  onChange={handleChange}
                >
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>

              <div className="profile-field full-width">
                <label>Place of Birth</label>
                <input
                  name="birthplace"
                  value={form.birthplace}
                  onChange={handleChange}
                  placeholder="Enter birthplace"
                />
              </div>

              <div className="profile-field">
                <label>Occupation</label>
                <input
                  name="occupation"
                  value={form.occupation}
                  onChange={handleChange}
                  placeholder="Enter occupation"
                />
              </div>

              <div className="profile-field">
                <label>Nationality</label>
                <input
                  name="nationality"
                  value={form.nationality}
                  onChange={handleChange}
                  placeholder="Enter nationality"
                />
              </div>
            </div>
          </div>

          <div className="profile-form-section">
            <h3>Passing Information</h3>
            <p className="profile-section-description">
              Optional. Fill this section only if applicable.
            </p>

            <div className="profile-form-grid">
              <div className="profile-field">
                <label>Date of Passing</label>
                <input
                  type="date"
                  name="dateOfPassing"
                  value={form.dateOfPassing}
                  onChange={handleChange}
                />
              </div>

              <div className="profile-field">
                <label>Place of Passing</label>
                <input
                  name="placeOfPassing"
                  value={form.placeOfPassing}
                  onChange={handleChange}
                  placeholder="Enter place"
                />
              </div>
            </div>
          </div>

          <div className="profile-form-actions">
            {profile && (
              <button
                type="button"
                className="profile-cancel-btn"
                onClick={handleCancel}
              >
                <X size={17} />
                Cancel
              </button>
            )}

            <button type="submit" className="profile-save-btn">
              <Save size={17} />
              {profile ? "Update Profile" : "Save Profile"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Saved profile display
  return (
    <div className="my-profile-page">
      <div className="profile-page-header">
        <button className="profile-back-btn" onClick={onBack}>
          <ArrowLeft size={18} />
          Back to Settings
        </button>

        <div className="profile-title-row">
          <div>
            <h2>My Profile</h2>
            <p>Your personal information and details.</p>
          </div>

          <button className="profile-edit-btn" onClick={handleEdit}>
            <Pencil size={16} />
            Edit Profile
          </button>
        </div>
      </div>

      <div className="profile-overview-card">
        <div className="profile-overview-image">
          {profile.profilePicture ? (
            <img src={profile.profilePicture} alt={profile.name} />
          ) : (
            <UserRound size={42} />
          )}
        </div>

        <div className="profile-overview-info">
          <h2>{profile.name}</h2>
          <p>{profile.occupation || "Occupation not provided"}</p>
          <span>{myEmail || ""}</span>
        </div>
      </div>

      <div className="profile-details-card">
        <div className="profile-details-heading">
          <h3>Personal Details</h3>
          <span>Profile Information</span>
        </div>

        <div className="profile-details-grid">
          <ProfileDetail
            icon={<CalendarDays size={18} />}
            label="Date of Birth"
            value={formatDate(profile.dateOfBirth)}
          />

          <ProfileDetail
            icon={<UserRound size={18} />}
            label="Gender"
            value={profile.gender || "Not provided"}
          />

          <ProfileDetail
            icon={<MapPin size={18} />}
            label="Place of Birth"
            value={profile.birthplace || "Not provided"}
          />

          <ProfileDetail
            icon={<BriefcaseBusiness size={18} />}
            label="Occupation"
            value={profile.occupation || "Not provided"}
          />

          <ProfileDetail
            icon={<Globe size={18} />}
            label="Nationality"
            value={profile.nationality || "Not provided"}
          />

          <ProfileDetail
            icon={<CalendarDays size={18} />}
            label="Date of Passing"
            value={formatDate(profile.dateOfPassing)}
          />

          <ProfileDetail
            icon={<MapPin size={18} />}
            label="Place of Passing"
            value={profile.placeOfPassing || "Not provided"}
          />
        </div>
      </div>
    </div>
  );
};

const ProfileDetail = ({ icon, label, value }) => (
  <div className="profile-detail-item">
    <div className="profile-detail-icon">{icon}</div>
    <div>
      <span>{label}</span>
      <p>{value}</p>
    </div>
  </div>
);

export default MyProfilePage;
