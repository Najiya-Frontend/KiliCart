export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
};

export const errorHandler = (err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }
  // Do not log request bodies, query parameters, database diagnostics or secrets.
  console.error(JSON.stringify({ event: 'API_ERROR', code: typeof err.code === 'string' ? err.code : 'UNEXPECTED' }));

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};
