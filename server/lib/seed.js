export const seedData = {
  users: [
    {
      nric: "S0000001A",
      passwordHash: "pbkdf2$sha512$210000$civic-voice-citizen-v1$7244abb22352f69c1bf8b877ed8affe61730c1088cadfe2ad05a7d02718caa3521ec92ccfdb13011205a10e36c8145d442cd22348235650eee150b4fc0c4bbfa",
      name: "Aisha Rahman",
      role: "citizen",
    },
    {
      nric: "S0000002B",
      passwordHash: "pbkdf2$sha512$210000$civic-voice-admin-v1$b6f07edb9486927fa966bf3efda05c9cfbea985dafd7b974cf3fb4d75898d3bfdf9db58b79eeca5826190e9e1edb1879ac1c8e6700fef977ff67bcafcdacdd9a",
      name: "Daniel Tan",
      role: "admin",
    },
  ],
  feedback: [
    {
      id: "fb-seed-1",
      nric: "S0000001A",
      name: "Aisha Rahman",
      message: "The new sheltered walkway near the library is helpful, but the lights turn off too early.",
      category: "General",
      status: "New",
      createdAt: "2026-08-29T09:14:00.000Z",
    },
  ],
};

export function freshSeed() {
  return structuredClone(seedData);
}
