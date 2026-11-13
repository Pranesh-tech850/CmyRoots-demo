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