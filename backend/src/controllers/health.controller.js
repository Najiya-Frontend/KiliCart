import { prisma } from "../config/prisma.js";

export const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    message: "KiliCart API is running",
    data: {
      service: "kilicart-api",
      status: "healthy",
      timestamp: new Date().toISOString(),
    },
  });
};

export const getDatabaseHealth = async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      success: true,
      message: "KiliCart database connection successful",
      data: { database: "connected", status: "healthy" },
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'DATABASE_HEALTH_FAILED' }));
    res.status(503).json({
      success: false,
      message: "KiliCart database connection unavailable",
      data: { database: "disconnected", status: "unhealthy" },
    });
  }
};
