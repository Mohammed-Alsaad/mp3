// routes/tasks.js
var Task = require('../models/task');
var User = require('../models/user');
var { safeParseJSON, ensureParsedBody, wrapOk, wrapErr } = require('./utils');

module.exports = function (router) {
  // /api/tasks
  router.route('/tasks')
    .get(async (req, res) => {
      try {
        // Parse query params
        const where  = safeParseJSON(req.query.where, {});
        const sort   = safeParseJSON(req.query.sort, undefined);
        const select = safeParseJSON(req.query.select, undefined);
        const skip   = req.query.skip  ? parseInt(req.query.skip, 10)  : undefined;
        const limit  = req.query.limit ? parseInt(req.query.limit, 10) : 100; // default 100 for tasks
        const count  = (String(req.query.count).toLowerCase() === 'true');

        // Build query
        let query = Task.find(where);
        if (sort)   query = query.sort(sort);
        if (select) query = query.select(select);
        if (skip != null)   query = query.skip(skip);

        if (limit != null) { query = query.limit(limit); } 
        else { query = query.limit(100); }

        // Execute
        const docs = await query.exec();

        // If count=true, return number of matching docs after applying skip/limit
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
        const {
          name,
          description,
          deadline,
          completed,
          assignedUser,
          assignedUserName
        } = req.body || {};

        // Validation
        if (!name || !deadline) {
          return res.status(400).json(wrapErr('Task must include name and deadline', {}));
        }

        let assignedUserId = assignedUser || '';
        let assignedName = 'unassigned';

        // If assignedUser exists, verify it
        if (assignedUserId) {
          const user = await User.findById(assignedUserId);
          if (!user) {
            return res.status(400).json(wrapErr('assignedUser is not a valid user id', {}));
          }
          assignedName = assignedUserName || user.name;
        }

        const task = new Task({
          name,
          description: description || '',
          deadline,
          completed: !!completed,
          assignedUser: assignedUserId,
          assignedUserName: assignedUserId ? assignedName : 'unassigned'
        });

        await task.save();

        // If assigned and not completed, add to user.pendingTasks
        if (assignedUserId && !task.completed) {
          await User.updateOne(
            { _id: assignedUserId },
            { $addToSet: { pendingTasks: task._id.toString() } }
          );
        }

        return res.status(201).json(wrapOk('Created', task));
      } catch (err) {
        return res.status(500).json(wrapErr('Server error creating task', {}));
      }
    });

  // /api/tasks/:id
  router.route('/tasks/:id')
    .get(async (req, res) => {
      try {
        const select = safeParseJSON(req.query.select, undefined);
        let q = Task.findById(req.params.id);
        if (select) q = q.select(select);
        const doc = await q.exec();
        if (!doc) return res.status(404).json(wrapErr('Task not found', {}));
        return res.status(200).json(wrapOk('OK', doc));
      } catch (err) {
        return res.status(400).json(wrapErr('Bad request', {}));
      }
    })

    .put(async (req, res) => {
      try {
        if (!ensureParsedBody(req, res)) return;
        const {
          name,
          description,
          deadline,
          completed,
          assignedUser,
          assignedUserName
        } = req.body || {};

        // Validation
        if (!name || !deadline) {
          return res.status(400).json(wrapErr('Task must include name and deadline', {}));
        }

        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json(wrapErr('Task not found', {}));

        const oldAssignedUser = task.assignedUser || '';
        const oldCompleted = !!task.completed;

        // Validate new assigned user (if any)
        let newAssignedUser = assignedUser || '';
        let newAssignedName = 'unassigned';

        if (newAssignedUser) {
          const user = await User.findById(newAssignedUser);
          if (!user) return res.status(400).json(wrapErr('assignedUser is not a valid user id', {}));
          newAssignedName = assignedUserName || user.name;
        }

        // Update fields
        task.name = name;
        task.description = description || '';
        task.deadline = deadline;
        task.completed = !!completed;
        task.assignedUser = newAssignedUser;
        task.assignedUserName = newAssignedUser ? newAssignedName : 'unassigned';

        await task.save();

        const newCompleted = task.completed;

        // Maintain two-way consistency between task and user
        if (oldAssignedUser && oldAssignedUser !== newAssignedUser) {
          // Remove task from old user's pending list
          await User.updateOne(
            { _id: oldAssignedUser },
            { $pull: { pendingTasks: task._id.toString() } }
          );
        }

        if (newAssignedUser && newAssignedUser !== oldAssignedUser) {
          // Add to new user's pending list if not completed
          if (!newCompleted) {
            await User.updateOne(
              { _id: newAssignedUser },
              { $addToSet: { pendingTasks: task._id.toString() } }
            );
          }
        }

        // Handle completion status changes
        if (newAssignedUser) {
          if (!oldCompleted && newCompleted) {
            await User.updateOne(
              { _id: newAssignedUser },
              { $pull: { pendingTasks: task._id.toString() } }
            );
          } else if (oldCompleted && !newCompleted) {
            await User.updateOne(
              { _id: newAssignedUser },
              { $addToSet: { pendingTasks: task._id.toString() } }
            );
          }
        }

        return res.status(200).json(wrapOk('OK', task));
      } catch (err) {
        return res.status(500).json(wrapErr('Server error updating task', {}));
      }
    })

    .delete(async (req, res) => {
      try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json(wrapErr('Task not found', {}));

        if (task.assignedUser) {
          await User.updateOne(
            { _id: task.assignedUser },
            { $pull: { pendingTasks: task._id.toString() } }
          );
        }

        await task.deleteOne();
        return res.status(200).json(wrapOk('Task Deleted', {}));
      } catch (err) {
        return res.status(500).json(wrapErr('Server error deleting task', {}));
      }
    });

  return router;
};
