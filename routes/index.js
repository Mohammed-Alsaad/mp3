/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
  app.use('/api', require('./home.js')(router));
  app.use('/api', require('./users.js')(router));
  app.use('/api', require('./tasks.js')(router));

  // Catch-all for unimplemented /api/... routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({
      message: 'Endpoint not implemented',
      data: {}
    });
  });
};
