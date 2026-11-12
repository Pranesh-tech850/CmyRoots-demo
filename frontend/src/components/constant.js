/* ⚠️ MUST match your server's listen() port */
export const SOCKET_URL = "http://localhost:4000";

/* chat: emojis for the picker, image limit, and group keys.
   A group chat is selected with the key "g:<id>", a person with their name. */
export const EMOJIS = (
  "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😎 🤩 🥳 😏 " +
  "😢 😭 😤 😡 🥺 😱 😴 🤔 🙄 😬 🤗 🤭 🤫 😷 🤒 🥶 🥵 🤯 😐 😮 " +
  "👍 👎 👏 🙌 🙏 💪 👋 🤝 ✌️ 🤞 👌 🤙 👀 🫶 " +
  "❤️ 🧡 💛 💚 💙 💜 🖤 💔 💕 💖 " +
  "🎉 🎊 🎁 🎂 🔥 ✨ ⭐ 🌟 💯 ✅ ❌ 🏠 👨‍👩‍👧‍👦 🌳 🌸 🍕 🍔 🍰 ☕ 🎵 📷 ✈️ 🚗 🌞 🌙"
).split(" ");

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const isGroupKey = (k) => typeof k === "string" && k.startsWith("g:");

/* shown until the real list arrives from the server */
export const DEFAULT_MEMBERS = [
  { name: "Sarah",  email: "sarah@example.com",  avatar: "👩🏻" },
  { name: "Robert", email: "robert@example.com", avatar: "👨🏻" },
  { name: "Linda",  email: "linda@example.com",  avatar: "👩🏻" },
  { name: "Mike",   email: "mike@example.com",   avatar: "👦🏻" },
];

/* relations before the tree has loaded */
export const DEFAULT_RELATIONS = {
  Sarah:  { Robert: "Father", Linda: "Mother", Mike: "Brother" },
  Robert: { Sarah: "Daughter", Linda: "Wife",  Mike: "Son" },
  Linda:  { Sarah: "Daughter", Robert: "Husband", Mike: "Son" },
  Mike:   { Sarah: "Sister", Robert: "Father", Linda: "Mother" },
};