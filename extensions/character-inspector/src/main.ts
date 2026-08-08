// Điểm vào của extension. Không cần logic gì đặc biệt,
// việc đăng ký inspector đã khai báo trong package.json (contributions.inspector).
export const methods: Record<string, (...args: any[]) => any> = {};

export function load() {}

export function unload() {}
