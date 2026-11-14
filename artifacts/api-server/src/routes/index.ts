import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import teamRouter from "./team";
import tasksRouter from "./tasks";
import notificationsRouter from "./notifications";
import assistantsRouter from "./assistants";
import sheetsRouter from "./sheets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(teamRouter);
router.use(tasksRouter);
router.use(notificationsRouter);
router.use(assistantsRouter);
router.use(sheetsRouter);

export default router;
