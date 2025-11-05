// routes/utils.js
function safeParseJSON(value, fallback) {
  // If value is null or undefined, return fallback
  if (value == null) return fallback;

  // If Express or Postman already parsed it into an object, just return it
  if (typeof value === 'object') return value;

  // If it's a string, try parsing it
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return fallback;
    }
  }

  // If it’s some other unexpected type, return fallback
  return fallback;
}

function ensureParsedBody(req, res) {
  // If nothing was sent at all
  if (req.body == null || req.body === '') {
    res
      .status(400)
      .json({
        message: 'Bad request: missing request body (expected JSON or form data)',
        data: {}
      });
    return false;
  }

  // If it's a string, try parsing it as JSON
  if (typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      res
        .status(400)
        .json({
          message: 'Bad request: request body could not be parsed (expected valid JSON or form data)',
          data: {}
        });
      return false;
    }
  }

  // If after parsing, it’s still not an object
  if (typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
    res
      .status(400)
      .json({
        message: 'Bad request: invalid request format',
        data: {}
      });
    return false;
  }

  // ✅ Body is valid
  return true;
}

function wrapOk(message, data) {
  return { message, data: data ?? {} };
}

function wrapErr(message, data) {
  return { message, data: data ?? {} };
}

module.exports = {
  safeParseJSON,
  ensureParsedBody,
  wrapOk,
  wrapErr
};
