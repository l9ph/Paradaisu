/** Imagen grande (`setImage`) en embeds que no van ligados al avatar de un usuario. */
export const DEFAULT_EMBED_BANNER_URL =
  "https://media.discordapp.net/attachments/1469241754179076128/1485752720630611988/IMG_0209.jpg?ex=69c3ab4c&is=69c259cc&hm=03efbb2eed4534be0eb9cc4d4bdd95c6ba9c91de66e0913c41db73a9b97354c5&=&format=webp";

export function userAvatarImageUrl(user) {
  if (!user?.displayAvatarURL) return DEFAULT_EMBED_BANNER_URL;
  return user.displayAvatarURL({ size: 512, extension: "png", forceStatic: false });
}

/** Avatar pequeño para `setThumbnail` en embeds de ticket. */
export function userAvatarThumbnailUrl(user) {
  if (!user?.displayAvatarURL) return DEFAULT_EMBED_BANNER_URL;
  return user.displayAvatarURL({ size: 128, extension: "png", forceStatic: false });
}
