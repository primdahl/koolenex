import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { router as settingsRouter, setRebuildDemoMap } from './settings.ts';
import { router as catalogRouter } from './catalog.ts';
import { router as devicesRouter } from './devices.ts';
import { router as gasRouter } from './gas.ts';
import { router as projectsRouter } from './projects.ts';
import {
  router as busRouter,
  normalizeDptKey,
  decodeRawValue,
  rebuildDemoMap,
  setBus as setBusImpl,
} from './bus.ts';

import {
  writeKnxFloat16,
  writeBits,
  buildGATable,
  buildAssocTable,
  etsTestMatch,
} from './knx-tables.ts';

interface AppRouter extends express.Router {
  setBus: (bus: unknown) => void;
}

const router = express.Router() as AppRouter;

// Validate numeric route params — reject non-numeric :id, :pid, :did with 400
router.param(
  'id',
  (_req: Request, res: Response, next: NextFunction, val: string): void => {
    if (!/^\d+$/.test(val)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    next();
  },
);
router.param(
  'pid',
  (_req: Request, res: Response, next: NextFunction, val: string): void => {
    if (!/^\d+$/.test(val)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    next();
  },
);
router.param(
  'did',
  (_req: Request, res: Response, next: NextFunction, val: string): void => {
    if (!/^\d+$/.test(val)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    next();
  },
);

// Mount sub-routers
router.use('/', settingsRouter);
router.use('/', projectsRouter);
router.use('/', devicesRouter);
router.use('/', gasRouter);
router.use('/', catalogRouter);
router.use('/', busRouter);

// Wire up the rebuildDemoMap dependency: settings needs to call bus.rebuildDemoMap
setRebuildDemoMap(rebuildDemoMap);

// Inject bus instance (called from server/index.js after creating the instance)
router.setBus = (bus: unknown): void => {
  setBusImpl(bus as Parameters<typeof setBusImpl>[0]);
};

export {
  router,
  writeKnxFloat16,
  writeBits,
  normalizeDptKey,
  decodeRawValue,
  buildGATable,
  buildAssocTable,
  etsTestMatch,
};
