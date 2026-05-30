// Shared user-facing copy. Tone: humor + low pressure + "we respect your taste".
// English only (v1). Keep one-off strings inline; collect only what repeats or
// benefits from a single edit point.

export const copy = {
  profile: {
    streak: (days: number) => `${days}-day streak`,
    noStreak: 'Your taste, one album at a time',
    discovered: (n: number) => `${n} album${n === 1 ? '' : 's'} discovered`,
    tasteTitle: 'Your taste',
    librarySpan: (min: number, max: number) =>
      min === max ? `Your library lives in ${min}` : `Your library spans ${min}–${max}`,
    listeningTitle: 'Listening',
    listeningEmpty: "No journal entries yet — rate a pick and it'll show up here.",
    connectionsTitle: 'Connections',
    settingsTitle: 'Settings',
  },
} as const;
