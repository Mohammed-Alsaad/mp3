// routes/users.js
var User = require('../models/user');
var Task = require('../models/task');
var { safeParseJSON, ensureParsedBody, wrapOk, wrapErr } = require('./utils');

module.exports = function (router) {
  // /api/users
  router.route('/users')
    .get(async (req, res) => {
      try {
        // Parse all possible query parameters safely
        const where  = safeParseJSON(req.query.where, {});
        const sort   = safeParseJSON(req.query.sort, undefined);
        const select = safeParseJSON(req.query.select, undefined);
        const skip   = req.query.skip  ? parseInt(req.query.skip, 10)  : undefined;
        const limit  = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
        const count  = (String(req.query.count).toLowerCase() === 'true');

        // Build Mongoose query with all modifiers
        let query = User.find(where);
        if (sort)   query = query.sort(sort);
        if (select) query = query.select(select);
        if (skip != null)   query = query.skip(skip);
        // NO default limit for users
        if (limit != null)  query = query.limit(limit);

        // Execute once
        const docs = await query.exec();

        // If count=true, return how many docs match the entire query (after skip/limit)
        if (count) {
          return res.status(200).json(wrapOk('OK', docs.length));
        }
        // if (!docs || docs.length === 0) {
        //   return res.status(200).json(wrapOk('No content', docs));
        // }

        return res.status(200).json(wrapOk('OK', docs));
      } catch (err) {
        return res.status(400).json(wrapErr('Bad request: invalid query parameters', {}));
      }
    })

    .post(async (req, res) => {
      try {
        if (!ensureParsedBody(req, res)) return;
        const { name, email, pendingTasks } = req.body || {};
        if (!name || !email) {
          return res.status(400).json(wrapErr('User must include name and email', {}));
        }

        if (Array.isArray(pendingTasks) && pendingTasks.length > 0) {
        // 1️⃣ Check that all task IDs exist
        const foundTasks = await Task.find({ _id: { $in: pendingTasks } });
        if (foundTasks.length !== pendingTasks.length) {
          return res
            .status(400)
            .json(wrapErr('One or more task IDs in pendingTasks do not exist', {}));
        }

        // 2️⃣ Check for conflicts (tasks already assigned to another user)
        const conflict = foundTasks.find(
          (t) => t.assignedUser && t.assignedUser.toString() !== ''
        );

        if (conflict) {
          return res
            .status(409)
            .json(wrapErr('Conflict: One or more tasks are already assigned to another user', {}));
        }
      }

        const user = new User({
          name,
          email,
          pendingTasks: Array.isArray(pendingTasks) ? pendingTasks : []
        });

        await user.save();
        return res.status(201).json(wrapOk('Created', user));
      } catch (err) {
        if (err && err.code === 11000) {
          return res.status(400).json(wrapErr('Email already exists', {}));
        }
        return res.status(500).json(wrapErr('Server error creating user', {}));
      }
    });

  // /api/users/:id
  router.route('/users/:id')
    .get(async (req, res) => {
      try {
        const select = safeParseJSON(req.query.select, undefined);
        let q = User.findById(req.params.id);
        if (select) q = q.select(select);
        const doc = await q.exec();
        if (!doc) return res.status(404).json(wrapErr('User not found', {}));
        return res.status(200).json(wrapOk('OK', doc));
      } catch (err) {
        return res.status(400).json(wrapErr('Bad request', {}));
      }
    })

    .put(async (req, res) => {
      try {
        if (!ensureParsedBody(req, res)) return;
        const { name, email } = req.body || {};

        // Validate required fields
        if (!name || !email) {
          return res.status(400).json(wrapErr('User must include name and email', {}));
        }

        // Find user by ID
        const user = await User.findById(req.params.id);
        if (!user) {
          return res.status(404).json(wrapErr('User not found', {}));
        }

        // Update user fields
        user.name = name;
        user.email = email;

        await user.save();

        // 🔹 Keep existing tasks consistent
        // If this user already has pendingTasks, update all related task documents
        if (Array.isArray(user.pendingTasks) && user.pendingTasks.length > 0) {
          await Task.updateMany(
            { _id: { $in: user.pendingTasks } },
            { $set: { assignedUser: user._id.toString(), assignedUserName: user.name } }
          );
        }

        return res.status(200).json(wrapOk('OK', user));
      } catch (err) {
        if (err && err.code === 11000) {
          return res.status(400).json(wrapErr('Email already exists', {}));
        }
        return res.status(500).json(wrapErr('Server error updating user', {}));
      }
    })

    .delete(async (req, res) => {
      try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json(wrapErr('User not found', {}));

        // Unassign tasks belonging to this user
        await Task.updateMany(
          { assignedUser: user._id.toString() },
          { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
        );

        await user.deleteOne();
        return res.status(204).json(wrapOk('User Deleted', {}));
      } catch (err) {
        return res.status(500).json(wrapErr('Server error deleting user', {}));
      }
    });

  return router;
};
