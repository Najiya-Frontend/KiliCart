import { roleService } from '../services/role.service.js';
export async function getRoles(req, res) {
  res.status(200).json({ success: true, message: 'Platform roles', data: await roleService.getPlatformRoles() });
}
