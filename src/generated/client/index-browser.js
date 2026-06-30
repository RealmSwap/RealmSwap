
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  passwordHash: 'passwordHash',
  name: 'name',
  discordId: 'discordId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  role: 'role'
};

exports.Prisma.SubscriptionScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  plan: 'plan',
  status: 'status',
  activeSlots: 'activeSlots',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ServerScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  name: 'name',
  game: 'game',
  ramAllocation: 'ramAllocation',
  region: 'region',
  status: 'status',
  runnerType: 'runnerType',
  localPath: 'localPath',
  pid: 'pid',
  password: 'password',
  enableUpnp: 'enableUpnp',
  ipAddress: 'ipAddress',
  port: 'port',
  definitionId: 'definitionId',
  paramValues: 'paramValues',
  healthStatus: 'healthStatus',
  cpuUsage: 'cpuUsage',
  memoryUsage: 'memoryUsage',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  snapshotInterval: 'snapshotInterval',
  lastSnapshotAt: 'lastSnapshotAt',
  inviteCode: 'inviteCode'
};

exports.Prisma.ServerHostLinkScalarFieldEnum = {
  id: 'id',
  serverId: 'serverId',
  provider: 'provider',
  host: 'host',
  port: 'port',
  username: 'username',
  secret: 'secret',
  remoteBasePath: 'remoteBasePath',
  excludeConfig: 'excludeConfig',
  lastPushAt: 'lastPushAt',
  lastPullAt: 'lastPullAt',
  lastError: 'lastError',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ArchiveScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  serverName: 'serverName',
  game: 'game',
  saveSizeGB: 'saveSizeGB',
  archivedAt: 'archivedAt',
  createdAt: 'createdAt'
};

exports.Prisma.ActivityLogScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  action: 'action',
  details: 'details',
  createdAt: 'createdAt'
};

exports.Prisma.BackupScalarFieldEnum = {
  id: 'id',
  serverId: 'serverId',
  userId: 'userId',
  name: 'name',
  game: 'game',
  filePath: 'filePath',
  fileSizeMB: 'fileSizeMB',
  backupType: 'backupType',
  createdAt: 'createdAt'
};

exports.Prisma.CollaboratorScalarFieldEnum = {
  id: 'id',
  serverId: 'serverId',
  userId: 'userId',
  role: 'role',
  createdAt: 'createdAt'
};

exports.Prisma.GameDefinitionScalarFieldEnum = {
  id: 'id',
  slug: 'slug',
  displayName: 'displayName',
  icon: 'icon',
  color: 'color',
  description: 'description',
  recommendedRamGB: 'recommendedRamGB',
  requiredDiskGB: 'requiredDiskGB',
  ownerId: 'ownerId',
  isBuiltIn: 'isBuiltIn',
  installMethod: 'installMethod',
  spec: 'spec',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ModInstallationScalarFieldEnum = {
  id: 'id',
  serverId: 'serverId',
  provider: 'provider',
  packageId: 'packageId',
  version: 'version',
  name: 'name',
  dependencies: 'dependencies',
  installedAt: 'installedAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ServerSnapshotScalarFieldEnum = {
  id: 'id',
  serverId: 'serverId',
  userId: 'userId',
  name: 'name',
  path: 'path',
  gameVersion: 'gameVersion',
  modCount: 'modCount',
  createdAt: 'createdAt'
};

exports.Prisma.ScheduledTaskScalarFieldEnum = {
  id: 'id',
  serverId: 'serverId',
  action: 'action',
  cronExpression: 'cronExpression',
  enabled: 'enabled',
  broadcastMsg: 'broadcastMsg',
  broadcastMin: 'broadcastMin',
  lastRunAt: 'lastRunAt',
  lastBroadcastAt: 'lastBroadcastAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MarketplaceTemplateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  author: 'author',
  gameSlug: 'gameSlug',
  tags: 'tags',
  downloads: 'downloads',
  likes: 'likes',
  dislikes: 'dislikes',
  verifiedLevel: 'verifiedLevel',
  payload: 'payload',
  customDefSpec: 'customDefSpec',
  createdAt: 'createdAt'
};

exports.Prisma.TemplateVoteScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  templateId: 'templateId',
  type: 'type',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  User: 'User',
  Subscription: 'Subscription',
  Server: 'Server',
  ServerHostLink: 'ServerHostLink',
  Archive: 'Archive',
  ActivityLog: 'ActivityLog',
  Backup: 'Backup',
  Collaborator: 'Collaborator',
  GameDefinition: 'GameDefinition',
  ModInstallation: 'ModInstallation',
  ServerSnapshot: 'ServerSnapshot',
  ScheduledTask: 'ScheduledTask',
  MarketplaceTemplate: 'MarketplaceTemplate',
  TemplateVote: 'TemplateVote'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
