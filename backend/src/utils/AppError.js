export class AppError extends Error {
  constructor(statusCode, title, detail, type = 'about:blank') {
    super(detail);
    this.statusCode = statusCode;
    this.title = title;
    this.detail = detail;
    this.type = type;
  }
}