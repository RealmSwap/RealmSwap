
/**
 * Client
**/

import * as runtime from './runtime/binary.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model User
 * 
 */
export type User = $Result.DefaultSelection<Prisma.$UserPayload>
/**
 * Model Subscription
 * 
 */
export type Subscription = $Result.DefaultSelection<Prisma.$SubscriptionPayload>
/**
 * Model Server
 * 
 */
export type Server = $Result.DefaultSelection<Prisma.$ServerPayload>
/**
 * Model Archive
 * 
 */
export type Archive = $Result.DefaultSelection<Prisma.$ArchivePayload>
/**
 * Model ActivityLog
 * 
 */
export type ActivityLog = $Result.DefaultSelection<Prisma.$ActivityLogPayload>
/**
 * Model Backup
 * 
 */
export type Backup = $Result.DefaultSelection<Prisma.$BackupPayload>
/**
 * Model Collaborator
 * 
 */
export type Collaborator = $Result.DefaultSelection<Prisma.$CollaboratorPayload>
/**
 * Model GameDefinition
 * 
 */
export type GameDefinition = $Result.DefaultSelection<Prisma.$GameDefinitionPayload>

/**
 * ##  Prisma Client ʲˢ
 * 
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Users
 * const users = await prisma.user.findMany()
 * ```
 *
 * 
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   * 
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Users
   * const users = await prisma.user.findMany()
   * ```
   *
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends (U | 'beforeExit')>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : V extends 'beforeExit' ? () => $Utils.JsPromise<void> : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs>

      /**
   * `prisma.user`: Exposes CRUD operations for the **User** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Users
    * const users = await prisma.user.findMany()
    * ```
    */
  get user(): Prisma.UserDelegate<ExtArgs>;

  /**
   * `prisma.subscription`: Exposes CRUD operations for the **Subscription** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Subscriptions
    * const subscriptions = await prisma.subscription.findMany()
    * ```
    */
  get subscription(): Prisma.SubscriptionDelegate<ExtArgs>;

  /**
   * `prisma.server`: Exposes CRUD operations for the **Server** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Servers
    * const servers = await prisma.server.findMany()
    * ```
    */
  get server(): Prisma.ServerDelegate<ExtArgs>;

  /**
   * `prisma.archive`: Exposes CRUD operations for the **Archive** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Archives
    * const archives = await prisma.archive.findMany()
    * ```
    */
  get archive(): Prisma.ArchiveDelegate<ExtArgs>;

  /**
   * `prisma.activityLog`: Exposes CRUD operations for the **ActivityLog** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ActivityLogs
    * const activityLogs = await prisma.activityLog.findMany()
    * ```
    */
  get activityLog(): Prisma.ActivityLogDelegate<ExtArgs>;

  /**
   * `prisma.backup`: Exposes CRUD operations for the **Backup** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Backups
    * const backups = await prisma.backup.findMany()
    * ```
    */
  get backup(): Prisma.BackupDelegate<ExtArgs>;

  /**
   * `prisma.collaborator`: Exposes CRUD operations for the **Collaborator** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Collaborators
    * const collaborators = await prisma.collaborator.findMany()
    * ```
    */
  get collaborator(): Prisma.CollaboratorDelegate<ExtArgs>;

  /**
   * `prisma.gameDefinition`: Exposes CRUD operations for the **GameDefinition** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more GameDefinitions
    * const gameDefinitions = await prisma.gameDefinition.findMany()
    * ```
    */
  get gameDefinition(): Prisma.GameDefinitionDelegate<ExtArgs>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError
  export import NotFoundError = runtime.NotFoundError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics 
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 5.22.0
   * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    User: 'User',
    Subscription: 'Subscription',
    Server: 'Server',
    Archive: 'Archive',
    ActivityLog: 'ActivityLog',
    Backup: 'Backup',
    Collaborator: 'Collaborator',
    GameDefinition: 'GameDefinition'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "user" | "subscription" | "server" | "archive" | "activityLog" | "backup" | "collaborator" | "gameDefinition"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      User: {
        payload: Prisma.$UserPayload<ExtArgs>
        fields: Prisma.UserFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findFirst: {
            args: Prisma.UserFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findMany: {
            args: Prisma.UserFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          create: {
            args: Prisma.UserCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          createMany: {
            args: Prisma.UserCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.UserCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          delete: {
            args: Prisma.UserDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          update: {
            args: Prisma.UserUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          deleteMany: {
            args: Prisma.UserDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.UserUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          aggregate: {
            args: Prisma.UserAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUser>
          }
          groupBy: {
            args: Prisma.UserGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserCountArgs<ExtArgs>
            result: $Utils.Optional<UserCountAggregateOutputType> | number
          }
        }
      }
      Subscription: {
        payload: Prisma.$SubscriptionPayload<ExtArgs>
        fields: Prisma.SubscriptionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SubscriptionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SubscriptionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SubscriptionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SubscriptionPayload>
          }
          findFirst: {
            args: Prisma.SubscriptionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SubscriptionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SubscriptionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SubscriptionPayload>
          }
          findMany: {
            args: Prisma.SubscriptionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SubscriptionPayload>[]
          }
          create: {
            args: Prisma.SubscriptionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SubscriptionPayload>
          }
          createMany: {
            args: Prisma.SubscriptionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SubscriptionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SubscriptionPayload>[]
          }
          delete: {
            args: Prisma.SubscriptionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SubscriptionPayload>
          }
          update: {
            args: Prisma.SubscriptionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SubscriptionPayload>
          }
          deleteMany: {
            args: Prisma.SubscriptionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SubscriptionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.SubscriptionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SubscriptionPayload>
          }
          aggregate: {
            args: Prisma.SubscriptionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSubscription>
          }
          groupBy: {
            args: Prisma.SubscriptionGroupByArgs<ExtArgs>
            result: $Utils.Optional<SubscriptionGroupByOutputType>[]
          }
          count: {
            args: Prisma.SubscriptionCountArgs<ExtArgs>
            result: $Utils.Optional<SubscriptionCountAggregateOutputType> | number
          }
        }
      }
      Server: {
        payload: Prisma.$ServerPayload<ExtArgs>
        fields: Prisma.ServerFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ServerFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ServerPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ServerFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ServerPayload>
          }
          findFirst: {
            args: Prisma.ServerFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ServerPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ServerFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ServerPayload>
          }
          findMany: {
            args: Prisma.ServerFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ServerPayload>[]
          }
          create: {
            args: Prisma.ServerCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ServerPayload>
          }
          createMany: {
            args: Prisma.ServerCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ServerCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ServerPayload>[]
          }
          delete: {
            args: Prisma.ServerDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ServerPayload>
          }
          update: {
            args: Prisma.ServerUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ServerPayload>
          }
          deleteMany: {
            args: Prisma.ServerDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ServerUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.ServerUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ServerPayload>
          }
          aggregate: {
            args: Prisma.ServerAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateServer>
          }
          groupBy: {
            args: Prisma.ServerGroupByArgs<ExtArgs>
            result: $Utils.Optional<ServerGroupByOutputType>[]
          }
          count: {
            args: Prisma.ServerCountArgs<ExtArgs>
            result: $Utils.Optional<ServerCountAggregateOutputType> | number
          }
        }
      }
      Archive: {
        payload: Prisma.$ArchivePayload<ExtArgs>
        fields: Prisma.ArchiveFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ArchiveFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArchivePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ArchiveFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArchivePayload>
          }
          findFirst: {
            args: Prisma.ArchiveFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArchivePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ArchiveFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArchivePayload>
          }
          findMany: {
            args: Prisma.ArchiveFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArchivePayload>[]
          }
          create: {
            args: Prisma.ArchiveCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArchivePayload>
          }
          createMany: {
            args: Prisma.ArchiveCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ArchiveCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArchivePayload>[]
          }
          delete: {
            args: Prisma.ArchiveDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArchivePayload>
          }
          update: {
            args: Prisma.ArchiveUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArchivePayload>
          }
          deleteMany: {
            args: Prisma.ArchiveDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ArchiveUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.ArchiveUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArchivePayload>
          }
          aggregate: {
            args: Prisma.ArchiveAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateArchive>
          }
          groupBy: {
            args: Prisma.ArchiveGroupByArgs<ExtArgs>
            result: $Utils.Optional<ArchiveGroupByOutputType>[]
          }
          count: {
            args: Prisma.ArchiveCountArgs<ExtArgs>
            result: $Utils.Optional<ArchiveCountAggregateOutputType> | number
          }
        }
      }
      ActivityLog: {
        payload: Prisma.$ActivityLogPayload<ExtArgs>
        fields: Prisma.ActivityLogFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ActivityLogFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActivityLogPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ActivityLogFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActivityLogPayload>
          }
          findFirst: {
            args: Prisma.ActivityLogFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActivityLogPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ActivityLogFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActivityLogPayload>
          }
          findMany: {
            args: Prisma.ActivityLogFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActivityLogPayload>[]
          }
          create: {
            args: Prisma.ActivityLogCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActivityLogPayload>
          }
          createMany: {
            args: Prisma.ActivityLogCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ActivityLogCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActivityLogPayload>[]
          }
          delete: {
            args: Prisma.ActivityLogDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActivityLogPayload>
          }
          update: {
            args: Prisma.ActivityLogUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActivityLogPayload>
          }
          deleteMany: {
            args: Prisma.ActivityLogDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ActivityLogUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.ActivityLogUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ActivityLogPayload>
          }
          aggregate: {
            args: Prisma.ActivityLogAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateActivityLog>
          }
          groupBy: {
            args: Prisma.ActivityLogGroupByArgs<ExtArgs>
            result: $Utils.Optional<ActivityLogGroupByOutputType>[]
          }
          count: {
            args: Prisma.ActivityLogCountArgs<ExtArgs>
            result: $Utils.Optional<ActivityLogCountAggregateOutputType> | number
          }
        }
      }
      Backup: {
        payload: Prisma.$BackupPayload<ExtArgs>
        fields: Prisma.BackupFieldRefs
        operations: {
          findUnique: {
            args: Prisma.BackupFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BackupPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.BackupFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BackupPayload>
          }
          findFirst: {
            args: Prisma.BackupFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BackupPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.BackupFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BackupPayload>
          }
          findMany: {
            args: Prisma.BackupFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BackupPayload>[]
          }
          create: {
            args: Prisma.BackupCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BackupPayload>
          }
          createMany: {
            args: Prisma.BackupCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.BackupCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BackupPayload>[]
          }
          delete: {
            args: Prisma.BackupDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BackupPayload>
          }
          update: {
            args: Prisma.BackupUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BackupPayload>
          }
          deleteMany: {
            args: Prisma.BackupDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.BackupUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.BackupUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$BackupPayload>
          }
          aggregate: {
            args: Prisma.BackupAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateBackup>
          }
          groupBy: {
            args: Prisma.BackupGroupByArgs<ExtArgs>
            result: $Utils.Optional<BackupGroupByOutputType>[]
          }
          count: {
            args: Prisma.BackupCountArgs<ExtArgs>
            result: $Utils.Optional<BackupCountAggregateOutputType> | number
          }
        }
      }
      Collaborator: {
        payload: Prisma.$CollaboratorPayload<ExtArgs>
        fields: Prisma.CollaboratorFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CollaboratorFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollaboratorPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CollaboratorFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollaboratorPayload>
          }
          findFirst: {
            args: Prisma.CollaboratorFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollaboratorPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CollaboratorFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollaboratorPayload>
          }
          findMany: {
            args: Prisma.CollaboratorFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollaboratorPayload>[]
          }
          create: {
            args: Prisma.CollaboratorCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollaboratorPayload>
          }
          createMany: {
            args: Prisma.CollaboratorCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CollaboratorCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollaboratorPayload>[]
          }
          delete: {
            args: Prisma.CollaboratorDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollaboratorPayload>
          }
          update: {
            args: Prisma.CollaboratorUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollaboratorPayload>
          }
          deleteMany: {
            args: Prisma.CollaboratorDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CollaboratorUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.CollaboratorUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CollaboratorPayload>
          }
          aggregate: {
            args: Prisma.CollaboratorAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCollaborator>
          }
          groupBy: {
            args: Prisma.CollaboratorGroupByArgs<ExtArgs>
            result: $Utils.Optional<CollaboratorGroupByOutputType>[]
          }
          count: {
            args: Prisma.CollaboratorCountArgs<ExtArgs>
            result: $Utils.Optional<CollaboratorCountAggregateOutputType> | number
          }
        }
      }
      GameDefinition: {
        payload: Prisma.$GameDefinitionPayload<ExtArgs>
        fields: Prisma.GameDefinitionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.GameDefinitionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameDefinitionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.GameDefinitionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameDefinitionPayload>
          }
          findFirst: {
            args: Prisma.GameDefinitionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameDefinitionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.GameDefinitionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameDefinitionPayload>
          }
          findMany: {
            args: Prisma.GameDefinitionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameDefinitionPayload>[]
          }
          create: {
            args: Prisma.GameDefinitionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameDefinitionPayload>
          }
          createMany: {
            args: Prisma.GameDefinitionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.GameDefinitionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameDefinitionPayload>[]
          }
          delete: {
            args: Prisma.GameDefinitionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameDefinitionPayload>
          }
          update: {
            args: Prisma.GameDefinitionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameDefinitionPayload>
          }
          deleteMany: {
            args: Prisma.GameDefinitionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.GameDefinitionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.GameDefinitionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GameDefinitionPayload>
          }
          aggregate: {
            args: Prisma.GameDefinitionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateGameDefinition>
          }
          groupBy: {
            args: Prisma.GameDefinitionGroupByArgs<ExtArgs>
            result: $Utils.Optional<GameDefinitionGroupByOutputType>[]
          }
          count: {
            args: Prisma.GameDefinitionCountArgs<ExtArgs>
            result: $Utils.Optional<GameDefinitionCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
  }


  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type UserCountOutputType
   */

  export type UserCountOutputType = {
    definitions: number
    servers: number
    archives: number
    logs: number
    collaboratorAccess: number
  }

  export type UserCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    definitions?: boolean | UserCountOutputTypeCountDefinitionsArgs
    servers?: boolean | UserCountOutputTypeCountServersArgs
    archives?: boolean | UserCountOutputTypeCountArchivesArgs
    logs?: boolean | UserCountOutputTypeCountLogsArgs
    collaboratorAccess?: boolean | UserCountOutputTypeCountCollaboratorAccessArgs
  }

  // Custom InputTypes
  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserCountOutputType
     */
    select?: UserCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountDefinitionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: GameDefinitionWhereInput
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountServersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ServerWhereInput
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountArchivesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ArchiveWhereInput
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountLogsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ActivityLogWhereInput
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountCollaboratorAccessArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CollaboratorWhereInput
  }


  /**
   * Count Type ServerCountOutputType
   */

  export type ServerCountOutputType = {
    backups: number
    collaborators: number
  }

  export type ServerCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    backups?: boolean | ServerCountOutputTypeCountBackupsArgs
    collaborators?: boolean | ServerCountOutputTypeCountCollaboratorsArgs
  }

  // Custom InputTypes
  /**
   * ServerCountOutputType without action
   */
  export type ServerCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ServerCountOutputType
     */
    select?: ServerCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * ServerCountOutputType without action
   */
  export type ServerCountOutputTypeCountBackupsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BackupWhereInput
  }

  /**
   * ServerCountOutputType without action
   */
  export type ServerCountOutputTypeCountCollaboratorsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CollaboratorWhereInput
  }


  /**
   * Count Type GameDefinitionCountOutputType
   */

  export type GameDefinitionCountOutputType = {
    servers: number
  }

  export type GameDefinitionCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    servers?: boolean | GameDefinitionCountOutputTypeCountServersArgs
  }

  // Custom InputTypes
  /**
   * GameDefinitionCountOutputType without action
   */
  export type GameDefinitionCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinitionCountOutputType
     */
    select?: GameDefinitionCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * GameDefinitionCountOutputType without action
   */
  export type GameDefinitionCountOutputTypeCountServersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ServerWhereInput
  }


  /**
   * Models
   */

  /**
   * Model User
   */

  export type AggregateUser = {
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  export type UserMinAggregateOutputType = {
    id: string | null
    email: string | null
    passwordHash: string | null
    name: string | null
    createdAt: Date | null
    updatedAt: Date | null
    role: string | null
  }

  export type UserMaxAggregateOutputType = {
    id: string | null
    email: string | null
    passwordHash: string | null
    name: string | null
    createdAt: Date | null
    updatedAt: Date | null
    role: string | null
  }

  export type UserCountAggregateOutputType = {
    id: number
    email: number
    passwordHash: number
    name: number
    createdAt: number
    updatedAt: number
    role: number
    _all: number
  }


  export type UserMinAggregateInputType = {
    id?: true
    email?: true
    passwordHash?: true
    name?: true
    createdAt?: true
    updatedAt?: true
    role?: true
  }

  export type UserMaxAggregateInputType = {
    id?: true
    email?: true
    passwordHash?: true
    name?: true
    createdAt?: true
    updatedAt?: true
    role?: true
  }

  export type UserCountAggregateInputType = {
    id?: true
    email?: true
    passwordHash?: true
    name?: true
    createdAt?: true
    updatedAt?: true
    role?: true
    _all?: true
  }

  export type UserAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which User to aggregate.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Users
    **/
    _count?: true | UserCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserMaxAggregateInputType
  }

  export type GetUserAggregateType<T extends UserAggregateArgs> = {
        [P in keyof T & keyof AggregateUser]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUser[P]>
      : GetScalarType<T[P], AggregateUser[P]>
  }




  export type UserGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
    orderBy?: UserOrderByWithAggregationInput | UserOrderByWithAggregationInput[]
    by: UserScalarFieldEnum[] | UserScalarFieldEnum
    having?: UserScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserCountAggregateInputType | true
    _min?: UserMinAggregateInputType
    _max?: UserMaxAggregateInputType
  }

  export type UserGroupByOutputType = {
    id: string
    email: string
    passwordHash: string
    name: string
    createdAt: Date
    updatedAt: Date
    role: string
    _count: UserCountAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  type GetUserGroupByPayload<T extends UserGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserGroupByOutputType[P]>
            : GetScalarType<T[P], UserGroupByOutputType[P]>
        }
      >
    >


  export type UserSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    email?: boolean
    passwordHash?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    role?: boolean
    definitions?: boolean | User$definitionsArgs<ExtArgs>
    subscription?: boolean | User$subscriptionArgs<ExtArgs>
    servers?: boolean | User$serversArgs<ExtArgs>
    archives?: boolean | User$archivesArgs<ExtArgs>
    logs?: boolean | User$logsArgs<ExtArgs>
    collaboratorAccess?: boolean | User$collaboratorAccessArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>

  export type UserSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    email?: boolean
    passwordHash?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    role?: boolean
  }, ExtArgs["result"]["user"]>

  export type UserSelectScalar = {
    id?: boolean
    email?: boolean
    passwordHash?: boolean
    name?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    role?: boolean
  }

  export type UserInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    definitions?: boolean | User$definitionsArgs<ExtArgs>
    subscription?: boolean | User$subscriptionArgs<ExtArgs>
    servers?: boolean | User$serversArgs<ExtArgs>
    archives?: boolean | User$archivesArgs<ExtArgs>
    logs?: boolean | User$logsArgs<ExtArgs>
    collaboratorAccess?: boolean | User$collaboratorAccessArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type UserIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $UserPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "User"
    objects: {
      definitions: Prisma.$GameDefinitionPayload<ExtArgs>[]
      subscription: Prisma.$SubscriptionPayload<ExtArgs> | null
      servers: Prisma.$ServerPayload<ExtArgs>[]
      archives: Prisma.$ArchivePayload<ExtArgs>[]
      logs: Prisma.$ActivityLogPayload<ExtArgs>[]
      collaboratorAccess: Prisma.$CollaboratorPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      email: string
      passwordHash: string
      name: string
      createdAt: Date
      updatedAt: Date
      role: string
    }, ExtArgs["result"]["user"]>
    composites: {}
  }

  type UserGetPayload<S extends boolean | null | undefined | UserDefaultArgs> = $Result.GetResult<Prisma.$UserPayload, S>

  type UserCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<UserFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: UserCountAggregateInputType | true
    }

  export interface UserDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['User'], meta: { name: 'User' } }
    /**
     * Find zero or one User that matches the filter.
     * @param {UserFindUniqueArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserFindUniqueArgs>(args: SelectSubset<T, UserFindUniqueArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one User that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {UserFindUniqueOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserFindUniqueOrThrowArgs>(args: SelectSubset<T, UserFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first User that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, UserFindFirstArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first User that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserFindFirstOrThrowArgs>(args?: SelectSubset<T, UserFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Users
     * const users = await prisma.user.findMany()
     * 
     * // Get first 10 Users
     * const users = await prisma.user.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const userWithIdOnly = await prisma.user.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UserFindManyArgs>(args?: SelectSubset<T, UserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a User.
     * @param {UserCreateArgs} args - Arguments to create a User.
     * @example
     * // Create one User
     * const User = await prisma.user.create({
     *   data: {
     *     // ... data to create a User
     *   }
     * })
     * 
     */
    create<T extends UserCreateArgs>(args: SelectSubset<T, UserCreateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Users.
     * @param {UserCreateManyArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserCreateManyArgs>(args?: SelectSubset<T, UserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Users and returns the data saved in the database.
     * @param {UserCreateManyAndReturnArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Users and only return the `id`
     * const userWithIdOnly = await prisma.user.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends UserCreateManyAndReturnArgs>(args?: SelectSubset<T, UserCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a User.
     * @param {UserDeleteArgs} args - Arguments to delete one User.
     * @example
     * // Delete one User
     * const User = await prisma.user.delete({
     *   where: {
     *     // ... filter to delete one User
     *   }
     * })
     * 
     */
    delete<T extends UserDeleteArgs>(args: SelectSubset<T, UserDeleteArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one User.
     * @param {UserUpdateArgs} args - Arguments to update one User.
     * @example
     * // Update one User
     * const user = await prisma.user.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserUpdateArgs>(args: SelectSubset<T, UserUpdateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Users.
     * @param {UserDeleteManyArgs} args - Arguments to filter Users to delete.
     * @example
     * // Delete a few Users
     * const { count } = await prisma.user.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserDeleteManyArgs>(args?: SelectSubset<T, UserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserUpdateManyArgs>(args: SelectSubset<T, UserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one User.
     * @param {UserUpsertArgs} args - Arguments to update or create a User.
     * @example
     * // Update or create a User
     * const user = await prisma.user.upsert({
     *   create: {
     *     // ... data to create a User
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the User we want to update
     *   }
     * })
     */
    upsert<T extends UserUpsertArgs>(args: SelectSubset<T, UserUpsertArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserCountArgs} args - Arguments to filter Users to count.
     * @example
     * // Count the number of Users
     * const count = await prisma.user.count({
     *   where: {
     *     // ... the filter for the Users we want to count
     *   }
     * })
    **/
    count<T extends UserCountArgs>(
      args?: Subset<T, UserCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserAggregateArgs>(args: Subset<T, UserAggregateArgs>): Prisma.PrismaPromise<GetUserAggregateType<T>>

    /**
     * Group by User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserGroupByArgs['orderBy'] }
        : { orderBy?: UserGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the User model
   */
  readonly fields: UserFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for User.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    definitions<T extends User$definitionsArgs<ExtArgs> = {}>(args?: Subset<T, User$definitionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "findMany"> | Null>
    subscription<T extends User$subscriptionArgs<ExtArgs> = {}>(args?: Subset<T, User$subscriptionArgs<ExtArgs>>): Prisma__SubscriptionClient<$Result.GetResult<Prisma.$SubscriptionPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    servers<T extends User$serversArgs<ExtArgs> = {}>(args?: Subset<T, User$serversArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "findMany"> | Null>
    archives<T extends User$archivesArgs<ExtArgs> = {}>(args?: Subset<T, User$archivesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ArchivePayload<ExtArgs>, T, "findMany"> | Null>
    logs<T extends User$logsArgs<ExtArgs> = {}>(args?: Subset<T, User$logsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ActivityLogPayload<ExtArgs>, T, "findMany"> | Null>
    collaboratorAccess<T extends User$collaboratorAccessArgs<ExtArgs> = {}>(args?: Subset<T, User$collaboratorAccessArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the User model
   */ 
  interface UserFieldRefs {
    readonly id: FieldRef<"User", 'String'>
    readonly email: FieldRef<"User", 'String'>
    readonly passwordHash: FieldRef<"User", 'String'>
    readonly name: FieldRef<"User", 'String'>
    readonly createdAt: FieldRef<"User", 'DateTime'>
    readonly updatedAt: FieldRef<"User", 'DateTime'>
    readonly role: FieldRef<"User", 'String'>
  }
    

  // Custom InputTypes
  /**
   * User findUnique
   */
  export type UserFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findUniqueOrThrow
   */
  export type UserFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findFirst
   */
  export type UserFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findFirstOrThrow
   */
  export type UserFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findMany
   */
  export type UserFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which Users to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User create
   */
  export type UserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to create a User.
     */
    data: XOR<UserCreateInput, UserUncheckedCreateInput>
  }

  /**
   * User createMany
   */
  export type UserCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
  }

  /**
   * User createManyAndReturn
   */
  export type UserCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
  }

  /**
   * User update
   */
  export type UserUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to update a User.
     */
    data: XOR<UserUpdateInput, UserUncheckedUpdateInput>
    /**
     * Choose, which User to update.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User updateMany
   */
  export type UserUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
  }

  /**
   * User upsert
   */
  export type UserUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The filter to search for the User to update in case it exists.
     */
    where: UserWhereUniqueInput
    /**
     * In case the User found by the `where` argument doesn't exist, create a new User with this data.
     */
    create: XOR<UserCreateInput, UserUncheckedCreateInput>
    /**
     * In case the User was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserUpdateInput, UserUncheckedUpdateInput>
  }

  /**
   * User delete
   */
  export type UserDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter which User to delete.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User deleteMany
   */
  export type UserDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Users to delete
     */
    where?: UserWhereInput
  }

  /**
   * User.definitions
   */
  export type User$definitionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
    where?: GameDefinitionWhereInput
    orderBy?: GameDefinitionOrderByWithRelationInput | GameDefinitionOrderByWithRelationInput[]
    cursor?: GameDefinitionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: GameDefinitionScalarFieldEnum | GameDefinitionScalarFieldEnum[]
  }

  /**
   * User.subscription
   */
  export type User$subscriptionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionInclude<ExtArgs> | null
    where?: SubscriptionWhereInput
  }

  /**
   * User.servers
   */
  export type User$serversArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
    where?: ServerWhereInput
    orderBy?: ServerOrderByWithRelationInput | ServerOrderByWithRelationInput[]
    cursor?: ServerWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ServerScalarFieldEnum | ServerScalarFieldEnum[]
  }

  /**
   * User.archives
   */
  export type User$archivesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveInclude<ExtArgs> | null
    where?: ArchiveWhereInput
    orderBy?: ArchiveOrderByWithRelationInput | ArchiveOrderByWithRelationInput[]
    cursor?: ArchiveWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ArchiveScalarFieldEnum | ArchiveScalarFieldEnum[]
  }

  /**
   * User.logs
   */
  export type User$logsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogInclude<ExtArgs> | null
    where?: ActivityLogWhereInput
    orderBy?: ActivityLogOrderByWithRelationInput | ActivityLogOrderByWithRelationInput[]
    cursor?: ActivityLogWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ActivityLogScalarFieldEnum | ActivityLogScalarFieldEnum[]
  }

  /**
   * User.collaboratorAccess
   */
  export type User$collaboratorAccessArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
    where?: CollaboratorWhereInput
    orderBy?: CollaboratorOrderByWithRelationInput | CollaboratorOrderByWithRelationInput[]
    cursor?: CollaboratorWhereUniqueInput
    take?: number
    skip?: number
    distinct?: CollaboratorScalarFieldEnum | CollaboratorScalarFieldEnum[]
  }

  /**
   * User without action
   */
  export type UserDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
  }


  /**
   * Model Subscription
   */

  export type AggregateSubscription = {
    _count: SubscriptionCountAggregateOutputType | null
    _avg: SubscriptionAvgAggregateOutputType | null
    _sum: SubscriptionSumAggregateOutputType | null
    _min: SubscriptionMinAggregateOutputType | null
    _max: SubscriptionMaxAggregateOutputType | null
  }

  export type SubscriptionAvgAggregateOutputType = {
    activeSlots: number | null
  }

  export type SubscriptionSumAggregateOutputType = {
    activeSlots: number | null
  }

  export type SubscriptionMinAggregateOutputType = {
    id: string | null
    userId: string | null
    plan: string | null
    status: string | null
    activeSlots: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SubscriptionMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    plan: string | null
    status: string | null
    activeSlots: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SubscriptionCountAggregateOutputType = {
    id: number
    userId: number
    plan: number
    status: number
    activeSlots: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type SubscriptionAvgAggregateInputType = {
    activeSlots?: true
  }

  export type SubscriptionSumAggregateInputType = {
    activeSlots?: true
  }

  export type SubscriptionMinAggregateInputType = {
    id?: true
    userId?: true
    plan?: true
    status?: true
    activeSlots?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SubscriptionMaxAggregateInputType = {
    id?: true
    userId?: true
    plan?: true
    status?: true
    activeSlots?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SubscriptionCountAggregateInputType = {
    id?: true
    userId?: true
    plan?: true
    status?: true
    activeSlots?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type SubscriptionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Subscription to aggregate.
     */
    where?: SubscriptionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Subscriptions to fetch.
     */
    orderBy?: SubscriptionOrderByWithRelationInput | SubscriptionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SubscriptionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Subscriptions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Subscriptions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Subscriptions
    **/
    _count?: true | SubscriptionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SubscriptionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SubscriptionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SubscriptionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SubscriptionMaxAggregateInputType
  }

  export type GetSubscriptionAggregateType<T extends SubscriptionAggregateArgs> = {
        [P in keyof T & keyof AggregateSubscription]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSubscription[P]>
      : GetScalarType<T[P], AggregateSubscription[P]>
  }




  export type SubscriptionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SubscriptionWhereInput
    orderBy?: SubscriptionOrderByWithAggregationInput | SubscriptionOrderByWithAggregationInput[]
    by: SubscriptionScalarFieldEnum[] | SubscriptionScalarFieldEnum
    having?: SubscriptionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SubscriptionCountAggregateInputType | true
    _avg?: SubscriptionAvgAggregateInputType
    _sum?: SubscriptionSumAggregateInputType
    _min?: SubscriptionMinAggregateInputType
    _max?: SubscriptionMaxAggregateInputType
  }

  export type SubscriptionGroupByOutputType = {
    id: string
    userId: string
    plan: string
    status: string
    activeSlots: number
    createdAt: Date
    updatedAt: Date
    _count: SubscriptionCountAggregateOutputType | null
    _avg: SubscriptionAvgAggregateOutputType | null
    _sum: SubscriptionSumAggregateOutputType | null
    _min: SubscriptionMinAggregateOutputType | null
    _max: SubscriptionMaxAggregateOutputType | null
  }

  type GetSubscriptionGroupByPayload<T extends SubscriptionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SubscriptionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SubscriptionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SubscriptionGroupByOutputType[P]>
            : GetScalarType<T[P], SubscriptionGroupByOutputType[P]>
        }
      >
    >


  export type SubscriptionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    plan?: boolean
    status?: boolean
    activeSlots?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["subscription"]>

  export type SubscriptionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    plan?: boolean
    status?: boolean
    activeSlots?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["subscription"]>

  export type SubscriptionSelectScalar = {
    id?: boolean
    userId?: boolean
    plan?: boolean
    status?: boolean
    activeSlots?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type SubscriptionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type SubscriptionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }

  export type $SubscriptionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Subscription"
    objects: {
      user: Prisma.$UserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      plan: string
      status: string
      activeSlots: number
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["subscription"]>
    composites: {}
  }

  type SubscriptionGetPayload<S extends boolean | null | undefined | SubscriptionDefaultArgs> = $Result.GetResult<Prisma.$SubscriptionPayload, S>

  type SubscriptionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<SubscriptionFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: SubscriptionCountAggregateInputType | true
    }

  export interface SubscriptionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Subscription'], meta: { name: 'Subscription' } }
    /**
     * Find zero or one Subscription that matches the filter.
     * @param {SubscriptionFindUniqueArgs} args - Arguments to find a Subscription
     * @example
     * // Get one Subscription
     * const subscription = await prisma.subscription.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SubscriptionFindUniqueArgs>(args: SelectSubset<T, SubscriptionFindUniqueArgs<ExtArgs>>): Prisma__SubscriptionClient<$Result.GetResult<Prisma.$SubscriptionPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Subscription that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {SubscriptionFindUniqueOrThrowArgs} args - Arguments to find a Subscription
     * @example
     * // Get one Subscription
     * const subscription = await prisma.subscription.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SubscriptionFindUniqueOrThrowArgs>(args: SelectSubset<T, SubscriptionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SubscriptionClient<$Result.GetResult<Prisma.$SubscriptionPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Subscription that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SubscriptionFindFirstArgs} args - Arguments to find a Subscription
     * @example
     * // Get one Subscription
     * const subscription = await prisma.subscription.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SubscriptionFindFirstArgs>(args?: SelectSubset<T, SubscriptionFindFirstArgs<ExtArgs>>): Prisma__SubscriptionClient<$Result.GetResult<Prisma.$SubscriptionPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Subscription that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SubscriptionFindFirstOrThrowArgs} args - Arguments to find a Subscription
     * @example
     * // Get one Subscription
     * const subscription = await prisma.subscription.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SubscriptionFindFirstOrThrowArgs>(args?: SelectSubset<T, SubscriptionFindFirstOrThrowArgs<ExtArgs>>): Prisma__SubscriptionClient<$Result.GetResult<Prisma.$SubscriptionPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Subscriptions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SubscriptionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Subscriptions
     * const subscriptions = await prisma.subscription.findMany()
     * 
     * // Get first 10 Subscriptions
     * const subscriptions = await prisma.subscription.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const subscriptionWithIdOnly = await prisma.subscription.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SubscriptionFindManyArgs>(args?: SelectSubset<T, SubscriptionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SubscriptionPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Subscription.
     * @param {SubscriptionCreateArgs} args - Arguments to create a Subscription.
     * @example
     * // Create one Subscription
     * const Subscription = await prisma.subscription.create({
     *   data: {
     *     // ... data to create a Subscription
     *   }
     * })
     * 
     */
    create<T extends SubscriptionCreateArgs>(args: SelectSubset<T, SubscriptionCreateArgs<ExtArgs>>): Prisma__SubscriptionClient<$Result.GetResult<Prisma.$SubscriptionPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Subscriptions.
     * @param {SubscriptionCreateManyArgs} args - Arguments to create many Subscriptions.
     * @example
     * // Create many Subscriptions
     * const subscription = await prisma.subscription.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SubscriptionCreateManyArgs>(args?: SelectSubset<T, SubscriptionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Subscriptions and returns the data saved in the database.
     * @param {SubscriptionCreateManyAndReturnArgs} args - Arguments to create many Subscriptions.
     * @example
     * // Create many Subscriptions
     * const subscription = await prisma.subscription.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Subscriptions and only return the `id`
     * const subscriptionWithIdOnly = await prisma.subscription.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SubscriptionCreateManyAndReturnArgs>(args?: SelectSubset<T, SubscriptionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SubscriptionPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Subscription.
     * @param {SubscriptionDeleteArgs} args - Arguments to delete one Subscription.
     * @example
     * // Delete one Subscription
     * const Subscription = await prisma.subscription.delete({
     *   where: {
     *     // ... filter to delete one Subscription
     *   }
     * })
     * 
     */
    delete<T extends SubscriptionDeleteArgs>(args: SelectSubset<T, SubscriptionDeleteArgs<ExtArgs>>): Prisma__SubscriptionClient<$Result.GetResult<Prisma.$SubscriptionPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Subscription.
     * @param {SubscriptionUpdateArgs} args - Arguments to update one Subscription.
     * @example
     * // Update one Subscription
     * const subscription = await prisma.subscription.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SubscriptionUpdateArgs>(args: SelectSubset<T, SubscriptionUpdateArgs<ExtArgs>>): Prisma__SubscriptionClient<$Result.GetResult<Prisma.$SubscriptionPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Subscriptions.
     * @param {SubscriptionDeleteManyArgs} args - Arguments to filter Subscriptions to delete.
     * @example
     * // Delete a few Subscriptions
     * const { count } = await prisma.subscription.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SubscriptionDeleteManyArgs>(args?: SelectSubset<T, SubscriptionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Subscriptions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SubscriptionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Subscriptions
     * const subscription = await prisma.subscription.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SubscriptionUpdateManyArgs>(args: SelectSubset<T, SubscriptionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Subscription.
     * @param {SubscriptionUpsertArgs} args - Arguments to update or create a Subscription.
     * @example
     * // Update or create a Subscription
     * const subscription = await prisma.subscription.upsert({
     *   create: {
     *     // ... data to create a Subscription
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Subscription we want to update
     *   }
     * })
     */
    upsert<T extends SubscriptionUpsertArgs>(args: SelectSubset<T, SubscriptionUpsertArgs<ExtArgs>>): Prisma__SubscriptionClient<$Result.GetResult<Prisma.$SubscriptionPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Subscriptions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SubscriptionCountArgs} args - Arguments to filter Subscriptions to count.
     * @example
     * // Count the number of Subscriptions
     * const count = await prisma.subscription.count({
     *   where: {
     *     // ... the filter for the Subscriptions we want to count
     *   }
     * })
    **/
    count<T extends SubscriptionCountArgs>(
      args?: Subset<T, SubscriptionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SubscriptionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Subscription.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SubscriptionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends SubscriptionAggregateArgs>(args: Subset<T, SubscriptionAggregateArgs>): Prisma.PrismaPromise<GetSubscriptionAggregateType<T>>

    /**
     * Group by Subscription.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SubscriptionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends SubscriptionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SubscriptionGroupByArgs['orderBy'] }
        : { orderBy?: SubscriptionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, SubscriptionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSubscriptionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Subscription model
   */
  readonly fields: SubscriptionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Subscription.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SubscriptionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Subscription model
   */ 
  interface SubscriptionFieldRefs {
    readonly id: FieldRef<"Subscription", 'String'>
    readonly userId: FieldRef<"Subscription", 'String'>
    readonly plan: FieldRef<"Subscription", 'String'>
    readonly status: FieldRef<"Subscription", 'String'>
    readonly activeSlots: FieldRef<"Subscription", 'Int'>
    readonly createdAt: FieldRef<"Subscription", 'DateTime'>
    readonly updatedAt: FieldRef<"Subscription", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Subscription findUnique
   */
  export type SubscriptionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionInclude<ExtArgs> | null
    /**
     * Filter, which Subscription to fetch.
     */
    where: SubscriptionWhereUniqueInput
  }

  /**
   * Subscription findUniqueOrThrow
   */
  export type SubscriptionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionInclude<ExtArgs> | null
    /**
     * Filter, which Subscription to fetch.
     */
    where: SubscriptionWhereUniqueInput
  }

  /**
   * Subscription findFirst
   */
  export type SubscriptionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionInclude<ExtArgs> | null
    /**
     * Filter, which Subscription to fetch.
     */
    where?: SubscriptionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Subscriptions to fetch.
     */
    orderBy?: SubscriptionOrderByWithRelationInput | SubscriptionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Subscriptions.
     */
    cursor?: SubscriptionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Subscriptions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Subscriptions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Subscriptions.
     */
    distinct?: SubscriptionScalarFieldEnum | SubscriptionScalarFieldEnum[]
  }

  /**
   * Subscription findFirstOrThrow
   */
  export type SubscriptionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionInclude<ExtArgs> | null
    /**
     * Filter, which Subscription to fetch.
     */
    where?: SubscriptionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Subscriptions to fetch.
     */
    orderBy?: SubscriptionOrderByWithRelationInput | SubscriptionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Subscriptions.
     */
    cursor?: SubscriptionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Subscriptions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Subscriptions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Subscriptions.
     */
    distinct?: SubscriptionScalarFieldEnum | SubscriptionScalarFieldEnum[]
  }

  /**
   * Subscription findMany
   */
  export type SubscriptionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionInclude<ExtArgs> | null
    /**
     * Filter, which Subscriptions to fetch.
     */
    where?: SubscriptionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Subscriptions to fetch.
     */
    orderBy?: SubscriptionOrderByWithRelationInput | SubscriptionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Subscriptions.
     */
    cursor?: SubscriptionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Subscriptions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Subscriptions.
     */
    skip?: number
    distinct?: SubscriptionScalarFieldEnum | SubscriptionScalarFieldEnum[]
  }

  /**
   * Subscription create
   */
  export type SubscriptionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionInclude<ExtArgs> | null
    /**
     * The data needed to create a Subscription.
     */
    data: XOR<SubscriptionCreateInput, SubscriptionUncheckedCreateInput>
  }

  /**
   * Subscription createMany
   */
  export type SubscriptionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Subscriptions.
     */
    data: SubscriptionCreateManyInput | SubscriptionCreateManyInput[]
  }

  /**
   * Subscription createManyAndReturn
   */
  export type SubscriptionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Subscriptions.
     */
    data: SubscriptionCreateManyInput | SubscriptionCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Subscription update
   */
  export type SubscriptionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionInclude<ExtArgs> | null
    /**
     * The data needed to update a Subscription.
     */
    data: XOR<SubscriptionUpdateInput, SubscriptionUncheckedUpdateInput>
    /**
     * Choose, which Subscription to update.
     */
    where: SubscriptionWhereUniqueInput
  }

  /**
   * Subscription updateMany
   */
  export type SubscriptionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Subscriptions.
     */
    data: XOR<SubscriptionUpdateManyMutationInput, SubscriptionUncheckedUpdateManyInput>
    /**
     * Filter which Subscriptions to update
     */
    where?: SubscriptionWhereInput
  }

  /**
   * Subscription upsert
   */
  export type SubscriptionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionInclude<ExtArgs> | null
    /**
     * The filter to search for the Subscription to update in case it exists.
     */
    where: SubscriptionWhereUniqueInput
    /**
     * In case the Subscription found by the `where` argument doesn't exist, create a new Subscription with this data.
     */
    create: XOR<SubscriptionCreateInput, SubscriptionUncheckedCreateInput>
    /**
     * In case the Subscription was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SubscriptionUpdateInput, SubscriptionUncheckedUpdateInput>
  }

  /**
   * Subscription delete
   */
  export type SubscriptionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionInclude<ExtArgs> | null
    /**
     * Filter which Subscription to delete.
     */
    where: SubscriptionWhereUniqueInput
  }

  /**
   * Subscription deleteMany
   */
  export type SubscriptionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Subscriptions to delete
     */
    where?: SubscriptionWhereInput
  }

  /**
   * Subscription without action
   */
  export type SubscriptionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Subscription
     */
    select?: SubscriptionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SubscriptionInclude<ExtArgs> | null
  }


  /**
   * Model Server
   */

  export type AggregateServer = {
    _count: ServerCountAggregateOutputType | null
    _avg: ServerAvgAggregateOutputType | null
    _sum: ServerSumAggregateOutputType | null
    _min: ServerMinAggregateOutputType | null
    _max: ServerMaxAggregateOutputType | null
  }

  export type ServerAvgAggregateOutputType = {
    ramAllocation: number | null
    pid: number | null
    port: number | null
    cpuUsage: number | null
    memoryUsage: number | null
    snapshotInterval: number | null
  }

  export type ServerSumAggregateOutputType = {
    ramAllocation: number | null
    pid: number | null
    port: number | null
    cpuUsage: number | null
    memoryUsage: number | null
    snapshotInterval: number | null
  }

  export type ServerMinAggregateOutputType = {
    id: string | null
    userId: string | null
    name: string | null
    game: string | null
    ramAllocation: number | null
    region: string | null
    status: string | null
    runnerType: string | null
    localPath: string | null
    pid: number | null
    password: string | null
    enableUpnp: boolean | null
    ipAddress: string | null
    port: number | null
    definitionId: string | null
    paramValues: string | null
    cpuUsage: number | null
    memoryUsage: number | null
    createdAt: Date | null
    updatedAt: Date | null
    snapshotInterval: number | null
    lastSnapshotAt: Date | null
  }

  export type ServerMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    name: string | null
    game: string | null
    ramAllocation: number | null
    region: string | null
    status: string | null
    runnerType: string | null
    localPath: string | null
    pid: number | null
    password: string | null
    enableUpnp: boolean | null
    ipAddress: string | null
    port: number | null
    definitionId: string | null
    paramValues: string | null
    cpuUsage: number | null
    memoryUsage: number | null
    createdAt: Date | null
    updatedAt: Date | null
    snapshotInterval: number | null
    lastSnapshotAt: Date | null
  }

  export type ServerCountAggregateOutputType = {
    id: number
    userId: number
    name: number
    game: number
    ramAllocation: number
    region: number
    status: number
    runnerType: number
    localPath: number
    pid: number
    password: number
    enableUpnp: number
    ipAddress: number
    port: number
    definitionId: number
    paramValues: number
    cpuUsage: number
    memoryUsage: number
    createdAt: number
    updatedAt: number
    snapshotInterval: number
    lastSnapshotAt: number
    _all: number
  }


  export type ServerAvgAggregateInputType = {
    ramAllocation?: true
    pid?: true
    port?: true
    cpuUsage?: true
    memoryUsage?: true
    snapshotInterval?: true
  }

  export type ServerSumAggregateInputType = {
    ramAllocation?: true
    pid?: true
    port?: true
    cpuUsage?: true
    memoryUsage?: true
    snapshotInterval?: true
  }

  export type ServerMinAggregateInputType = {
    id?: true
    userId?: true
    name?: true
    game?: true
    ramAllocation?: true
    region?: true
    status?: true
    runnerType?: true
    localPath?: true
    pid?: true
    password?: true
    enableUpnp?: true
    ipAddress?: true
    port?: true
    definitionId?: true
    paramValues?: true
    cpuUsage?: true
    memoryUsage?: true
    createdAt?: true
    updatedAt?: true
    snapshotInterval?: true
    lastSnapshotAt?: true
  }

  export type ServerMaxAggregateInputType = {
    id?: true
    userId?: true
    name?: true
    game?: true
    ramAllocation?: true
    region?: true
    status?: true
    runnerType?: true
    localPath?: true
    pid?: true
    password?: true
    enableUpnp?: true
    ipAddress?: true
    port?: true
    definitionId?: true
    paramValues?: true
    cpuUsage?: true
    memoryUsage?: true
    createdAt?: true
    updatedAt?: true
    snapshotInterval?: true
    lastSnapshotAt?: true
  }

  export type ServerCountAggregateInputType = {
    id?: true
    userId?: true
    name?: true
    game?: true
    ramAllocation?: true
    region?: true
    status?: true
    runnerType?: true
    localPath?: true
    pid?: true
    password?: true
    enableUpnp?: true
    ipAddress?: true
    port?: true
    definitionId?: true
    paramValues?: true
    cpuUsage?: true
    memoryUsage?: true
    createdAt?: true
    updatedAt?: true
    snapshotInterval?: true
    lastSnapshotAt?: true
    _all?: true
  }

  export type ServerAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Server to aggregate.
     */
    where?: ServerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Servers to fetch.
     */
    orderBy?: ServerOrderByWithRelationInput | ServerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ServerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Servers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Servers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Servers
    **/
    _count?: true | ServerCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ServerAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ServerSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ServerMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ServerMaxAggregateInputType
  }

  export type GetServerAggregateType<T extends ServerAggregateArgs> = {
        [P in keyof T & keyof AggregateServer]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateServer[P]>
      : GetScalarType<T[P], AggregateServer[P]>
  }




  export type ServerGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ServerWhereInput
    orderBy?: ServerOrderByWithAggregationInput | ServerOrderByWithAggregationInput[]
    by: ServerScalarFieldEnum[] | ServerScalarFieldEnum
    having?: ServerScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ServerCountAggregateInputType | true
    _avg?: ServerAvgAggregateInputType
    _sum?: ServerSumAggregateInputType
    _min?: ServerMinAggregateInputType
    _max?: ServerMaxAggregateInputType
  }

  export type ServerGroupByOutputType = {
    id: string
    userId: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType: string
    localPath: string | null
    pid: number | null
    password: string | null
    enableUpnp: boolean
    ipAddress: string
    port: number
    definitionId: string | null
    paramValues: string | null
    cpuUsage: number
    memoryUsage: number
    createdAt: Date
    updatedAt: Date
    snapshotInterval: number
    lastSnapshotAt: Date | null
    _count: ServerCountAggregateOutputType | null
    _avg: ServerAvgAggregateOutputType | null
    _sum: ServerSumAggregateOutputType | null
    _min: ServerMinAggregateOutputType | null
    _max: ServerMaxAggregateOutputType | null
  }

  type GetServerGroupByPayload<T extends ServerGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ServerGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ServerGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ServerGroupByOutputType[P]>
            : GetScalarType<T[P], ServerGroupByOutputType[P]>
        }
      >
    >


  export type ServerSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    name?: boolean
    game?: boolean
    ramAllocation?: boolean
    region?: boolean
    status?: boolean
    runnerType?: boolean
    localPath?: boolean
    pid?: boolean
    password?: boolean
    enableUpnp?: boolean
    ipAddress?: boolean
    port?: boolean
    definitionId?: boolean
    paramValues?: boolean
    cpuUsage?: boolean
    memoryUsage?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    snapshotInterval?: boolean
    lastSnapshotAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
    definition?: boolean | Server$definitionArgs<ExtArgs>
    backups?: boolean | Server$backupsArgs<ExtArgs>
    collaborators?: boolean | Server$collaboratorsArgs<ExtArgs>
    _count?: boolean | ServerCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["server"]>

  export type ServerSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    name?: boolean
    game?: boolean
    ramAllocation?: boolean
    region?: boolean
    status?: boolean
    runnerType?: boolean
    localPath?: boolean
    pid?: boolean
    password?: boolean
    enableUpnp?: boolean
    ipAddress?: boolean
    port?: boolean
    definitionId?: boolean
    paramValues?: boolean
    cpuUsage?: boolean
    memoryUsage?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    snapshotInterval?: boolean
    lastSnapshotAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
    definition?: boolean | Server$definitionArgs<ExtArgs>
  }, ExtArgs["result"]["server"]>

  export type ServerSelectScalar = {
    id?: boolean
    userId?: boolean
    name?: boolean
    game?: boolean
    ramAllocation?: boolean
    region?: boolean
    status?: boolean
    runnerType?: boolean
    localPath?: boolean
    pid?: boolean
    password?: boolean
    enableUpnp?: boolean
    ipAddress?: boolean
    port?: boolean
    definitionId?: boolean
    paramValues?: boolean
    cpuUsage?: boolean
    memoryUsage?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    snapshotInterval?: boolean
    lastSnapshotAt?: boolean
  }

  export type ServerInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
    definition?: boolean | Server$definitionArgs<ExtArgs>
    backups?: boolean | Server$backupsArgs<ExtArgs>
    collaborators?: boolean | Server$collaboratorsArgs<ExtArgs>
    _count?: boolean | ServerCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type ServerIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
    definition?: boolean | Server$definitionArgs<ExtArgs>
  }

  export type $ServerPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Server"
    objects: {
      user: Prisma.$UserPayload<ExtArgs>
      definition: Prisma.$GameDefinitionPayload<ExtArgs> | null
      backups: Prisma.$BackupPayload<ExtArgs>[]
      collaborators: Prisma.$CollaboratorPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      name: string
      game: string
      ramAllocation: number
      region: string
      status: string
      runnerType: string
      localPath: string | null
      pid: number | null
      password: string | null
      enableUpnp: boolean
      ipAddress: string
      port: number
      definitionId: string | null
      paramValues: string | null
      cpuUsage: number
      memoryUsage: number
      createdAt: Date
      updatedAt: Date
      snapshotInterval: number
      lastSnapshotAt: Date | null
    }, ExtArgs["result"]["server"]>
    composites: {}
  }

  type ServerGetPayload<S extends boolean | null | undefined | ServerDefaultArgs> = $Result.GetResult<Prisma.$ServerPayload, S>

  type ServerCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<ServerFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: ServerCountAggregateInputType | true
    }

  export interface ServerDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Server'], meta: { name: 'Server' } }
    /**
     * Find zero or one Server that matches the filter.
     * @param {ServerFindUniqueArgs} args - Arguments to find a Server
     * @example
     * // Get one Server
     * const server = await prisma.server.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ServerFindUniqueArgs>(args: SelectSubset<T, ServerFindUniqueArgs<ExtArgs>>): Prisma__ServerClient<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Server that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {ServerFindUniqueOrThrowArgs} args - Arguments to find a Server
     * @example
     * // Get one Server
     * const server = await prisma.server.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ServerFindUniqueOrThrowArgs>(args: SelectSubset<T, ServerFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ServerClient<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Server that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ServerFindFirstArgs} args - Arguments to find a Server
     * @example
     * // Get one Server
     * const server = await prisma.server.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ServerFindFirstArgs>(args?: SelectSubset<T, ServerFindFirstArgs<ExtArgs>>): Prisma__ServerClient<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Server that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ServerFindFirstOrThrowArgs} args - Arguments to find a Server
     * @example
     * // Get one Server
     * const server = await prisma.server.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ServerFindFirstOrThrowArgs>(args?: SelectSubset<T, ServerFindFirstOrThrowArgs<ExtArgs>>): Prisma__ServerClient<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Servers that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ServerFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Servers
     * const servers = await prisma.server.findMany()
     * 
     * // Get first 10 Servers
     * const servers = await prisma.server.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const serverWithIdOnly = await prisma.server.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ServerFindManyArgs>(args?: SelectSubset<T, ServerFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Server.
     * @param {ServerCreateArgs} args - Arguments to create a Server.
     * @example
     * // Create one Server
     * const Server = await prisma.server.create({
     *   data: {
     *     // ... data to create a Server
     *   }
     * })
     * 
     */
    create<T extends ServerCreateArgs>(args: SelectSubset<T, ServerCreateArgs<ExtArgs>>): Prisma__ServerClient<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Servers.
     * @param {ServerCreateManyArgs} args - Arguments to create many Servers.
     * @example
     * // Create many Servers
     * const server = await prisma.server.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ServerCreateManyArgs>(args?: SelectSubset<T, ServerCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Servers and returns the data saved in the database.
     * @param {ServerCreateManyAndReturnArgs} args - Arguments to create many Servers.
     * @example
     * // Create many Servers
     * const server = await prisma.server.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Servers and only return the `id`
     * const serverWithIdOnly = await prisma.server.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ServerCreateManyAndReturnArgs>(args?: SelectSubset<T, ServerCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Server.
     * @param {ServerDeleteArgs} args - Arguments to delete one Server.
     * @example
     * // Delete one Server
     * const Server = await prisma.server.delete({
     *   where: {
     *     // ... filter to delete one Server
     *   }
     * })
     * 
     */
    delete<T extends ServerDeleteArgs>(args: SelectSubset<T, ServerDeleteArgs<ExtArgs>>): Prisma__ServerClient<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Server.
     * @param {ServerUpdateArgs} args - Arguments to update one Server.
     * @example
     * // Update one Server
     * const server = await prisma.server.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ServerUpdateArgs>(args: SelectSubset<T, ServerUpdateArgs<ExtArgs>>): Prisma__ServerClient<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Servers.
     * @param {ServerDeleteManyArgs} args - Arguments to filter Servers to delete.
     * @example
     * // Delete a few Servers
     * const { count } = await prisma.server.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ServerDeleteManyArgs>(args?: SelectSubset<T, ServerDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Servers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ServerUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Servers
     * const server = await prisma.server.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ServerUpdateManyArgs>(args: SelectSubset<T, ServerUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Server.
     * @param {ServerUpsertArgs} args - Arguments to update or create a Server.
     * @example
     * // Update or create a Server
     * const server = await prisma.server.upsert({
     *   create: {
     *     // ... data to create a Server
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Server we want to update
     *   }
     * })
     */
    upsert<T extends ServerUpsertArgs>(args: SelectSubset<T, ServerUpsertArgs<ExtArgs>>): Prisma__ServerClient<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Servers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ServerCountArgs} args - Arguments to filter Servers to count.
     * @example
     * // Count the number of Servers
     * const count = await prisma.server.count({
     *   where: {
     *     // ... the filter for the Servers we want to count
     *   }
     * })
    **/
    count<T extends ServerCountArgs>(
      args?: Subset<T, ServerCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ServerCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Server.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ServerAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ServerAggregateArgs>(args: Subset<T, ServerAggregateArgs>): Prisma.PrismaPromise<GetServerAggregateType<T>>

    /**
     * Group by Server.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ServerGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ServerGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ServerGroupByArgs['orderBy'] }
        : { orderBy?: ServerGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ServerGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetServerGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Server model
   */
  readonly fields: ServerFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Server.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ServerClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    definition<T extends Server$definitionArgs<ExtArgs> = {}>(args?: Subset<T, Server$definitionArgs<ExtArgs>>): Prisma__GameDefinitionClient<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    backups<T extends Server$backupsArgs<ExtArgs> = {}>(args?: Subset<T, Server$backupsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BackupPayload<ExtArgs>, T, "findMany"> | Null>
    collaborators<T extends Server$collaboratorsArgs<ExtArgs> = {}>(args?: Subset<T, Server$collaboratorsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Server model
   */ 
  interface ServerFieldRefs {
    readonly id: FieldRef<"Server", 'String'>
    readonly userId: FieldRef<"Server", 'String'>
    readonly name: FieldRef<"Server", 'String'>
    readonly game: FieldRef<"Server", 'String'>
    readonly ramAllocation: FieldRef<"Server", 'Float'>
    readonly region: FieldRef<"Server", 'String'>
    readonly status: FieldRef<"Server", 'String'>
    readonly runnerType: FieldRef<"Server", 'String'>
    readonly localPath: FieldRef<"Server", 'String'>
    readonly pid: FieldRef<"Server", 'Int'>
    readonly password: FieldRef<"Server", 'String'>
    readonly enableUpnp: FieldRef<"Server", 'Boolean'>
    readonly ipAddress: FieldRef<"Server", 'String'>
    readonly port: FieldRef<"Server", 'Int'>
    readonly definitionId: FieldRef<"Server", 'String'>
    readonly paramValues: FieldRef<"Server", 'String'>
    readonly cpuUsage: FieldRef<"Server", 'Float'>
    readonly memoryUsage: FieldRef<"Server", 'Float'>
    readonly createdAt: FieldRef<"Server", 'DateTime'>
    readonly updatedAt: FieldRef<"Server", 'DateTime'>
    readonly snapshotInterval: FieldRef<"Server", 'Int'>
    readonly lastSnapshotAt: FieldRef<"Server", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Server findUnique
   */
  export type ServerFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
    /**
     * Filter, which Server to fetch.
     */
    where: ServerWhereUniqueInput
  }

  /**
   * Server findUniqueOrThrow
   */
  export type ServerFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
    /**
     * Filter, which Server to fetch.
     */
    where: ServerWhereUniqueInput
  }

  /**
   * Server findFirst
   */
  export type ServerFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
    /**
     * Filter, which Server to fetch.
     */
    where?: ServerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Servers to fetch.
     */
    orderBy?: ServerOrderByWithRelationInput | ServerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Servers.
     */
    cursor?: ServerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Servers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Servers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Servers.
     */
    distinct?: ServerScalarFieldEnum | ServerScalarFieldEnum[]
  }

  /**
   * Server findFirstOrThrow
   */
  export type ServerFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
    /**
     * Filter, which Server to fetch.
     */
    where?: ServerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Servers to fetch.
     */
    orderBy?: ServerOrderByWithRelationInput | ServerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Servers.
     */
    cursor?: ServerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Servers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Servers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Servers.
     */
    distinct?: ServerScalarFieldEnum | ServerScalarFieldEnum[]
  }

  /**
   * Server findMany
   */
  export type ServerFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
    /**
     * Filter, which Servers to fetch.
     */
    where?: ServerWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Servers to fetch.
     */
    orderBy?: ServerOrderByWithRelationInput | ServerOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Servers.
     */
    cursor?: ServerWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Servers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Servers.
     */
    skip?: number
    distinct?: ServerScalarFieldEnum | ServerScalarFieldEnum[]
  }

  /**
   * Server create
   */
  export type ServerCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
    /**
     * The data needed to create a Server.
     */
    data: XOR<ServerCreateInput, ServerUncheckedCreateInput>
  }

  /**
   * Server createMany
   */
  export type ServerCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Servers.
     */
    data: ServerCreateManyInput | ServerCreateManyInput[]
  }

  /**
   * Server createManyAndReturn
   */
  export type ServerCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Servers.
     */
    data: ServerCreateManyInput | ServerCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Server update
   */
  export type ServerUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
    /**
     * The data needed to update a Server.
     */
    data: XOR<ServerUpdateInput, ServerUncheckedUpdateInput>
    /**
     * Choose, which Server to update.
     */
    where: ServerWhereUniqueInput
  }

  /**
   * Server updateMany
   */
  export type ServerUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Servers.
     */
    data: XOR<ServerUpdateManyMutationInput, ServerUncheckedUpdateManyInput>
    /**
     * Filter which Servers to update
     */
    where?: ServerWhereInput
  }

  /**
   * Server upsert
   */
  export type ServerUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
    /**
     * The filter to search for the Server to update in case it exists.
     */
    where: ServerWhereUniqueInput
    /**
     * In case the Server found by the `where` argument doesn't exist, create a new Server with this data.
     */
    create: XOR<ServerCreateInput, ServerUncheckedCreateInput>
    /**
     * In case the Server was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ServerUpdateInput, ServerUncheckedUpdateInput>
  }

  /**
   * Server delete
   */
  export type ServerDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
    /**
     * Filter which Server to delete.
     */
    where: ServerWhereUniqueInput
  }

  /**
   * Server deleteMany
   */
  export type ServerDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Servers to delete
     */
    where?: ServerWhereInput
  }

  /**
   * Server.definition
   */
  export type Server$definitionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
    where?: GameDefinitionWhereInput
  }

  /**
   * Server.backups
   */
  export type Server$backupsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupInclude<ExtArgs> | null
    where?: BackupWhereInput
    orderBy?: BackupOrderByWithRelationInput | BackupOrderByWithRelationInput[]
    cursor?: BackupWhereUniqueInput
    take?: number
    skip?: number
    distinct?: BackupScalarFieldEnum | BackupScalarFieldEnum[]
  }

  /**
   * Server.collaborators
   */
  export type Server$collaboratorsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
    where?: CollaboratorWhereInput
    orderBy?: CollaboratorOrderByWithRelationInput | CollaboratorOrderByWithRelationInput[]
    cursor?: CollaboratorWhereUniqueInput
    take?: number
    skip?: number
    distinct?: CollaboratorScalarFieldEnum | CollaboratorScalarFieldEnum[]
  }

  /**
   * Server without action
   */
  export type ServerDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
  }


  /**
   * Model Archive
   */

  export type AggregateArchive = {
    _count: ArchiveCountAggregateOutputType | null
    _avg: ArchiveAvgAggregateOutputType | null
    _sum: ArchiveSumAggregateOutputType | null
    _min: ArchiveMinAggregateOutputType | null
    _max: ArchiveMaxAggregateOutputType | null
  }

  export type ArchiveAvgAggregateOutputType = {
    saveSizeGB: number | null
  }

  export type ArchiveSumAggregateOutputType = {
    saveSizeGB: number | null
  }

  export type ArchiveMinAggregateOutputType = {
    id: string | null
    userId: string | null
    serverName: string | null
    game: string | null
    saveSizeGB: number | null
    archivedAt: Date | null
    createdAt: Date | null
  }

  export type ArchiveMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    serverName: string | null
    game: string | null
    saveSizeGB: number | null
    archivedAt: Date | null
    createdAt: Date | null
  }

  export type ArchiveCountAggregateOutputType = {
    id: number
    userId: number
    serverName: number
    game: number
    saveSizeGB: number
    archivedAt: number
    createdAt: number
    _all: number
  }


  export type ArchiveAvgAggregateInputType = {
    saveSizeGB?: true
  }

  export type ArchiveSumAggregateInputType = {
    saveSizeGB?: true
  }

  export type ArchiveMinAggregateInputType = {
    id?: true
    userId?: true
    serverName?: true
    game?: true
    saveSizeGB?: true
    archivedAt?: true
    createdAt?: true
  }

  export type ArchiveMaxAggregateInputType = {
    id?: true
    userId?: true
    serverName?: true
    game?: true
    saveSizeGB?: true
    archivedAt?: true
    createdAt?: true
  }

  export type ArchiveCountAggregateInputType = {
    id?: true
    userId?: true
    serverName?: true
    game?: true
    saveSizeGB?: true
    archivedAt?: true
    createdAt?: true
    _all?: true
  }

  export type ArchiveAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Archive to aggregate.
     */
    where?: ArchiveWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Archives to fetch.
     */
    orderBy?: ArchiveOrderByWithRelationInput | ArchiveOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ArchiveWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Archives from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Archives.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Archives
    **/
    _count?: true | ArchiveCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ArchiveAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ArchiveSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ArchiveMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ArchiveMaxAggregateInputType
  }

  export type GetArchiveAggregateType<T extends ArchiveAggregateArgs> = {
        [P in keyof T & keyof AggregateArchive]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateArchive[P]>
      : GetScalarType<T[P], AggregateArchive[P]>
  }




  export type ArchiveGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ArchiveWhereInput
    orderBy?: ArchiveOrderByWithAggregationInput | ArchiveOrderByWithAggregationInput[]
    by: ArchiveScalarFieldEnum[] | ArchiveScalarFieldEnum
    having?: ArchiveScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ArchiveCountAggregateInputType | true
    _avg?: ArchiveAvgAggregateInputType
    _sum?: ArchiveSumAggregateInputType
    _min?: ArchiveMinAggregateInputType
    _max?: ArchiveMaxAggregateInputType
  }

  export type ArchiveGroupByOutputType = {
    id: string
    userId: string
    serverName: string
    game: string
    saveSizeGB: number
    archivedAt: Date
    createdAt: Date
    _count: ArchiveCountAggregateOutputType | null
    _avg: ArchiveAvgAggregateOutputType | null
    _sum: ArchiveSumAggregateOutputType | null
    _min: ArchiveMinAggregateOutputType | null
    _max: ArchiveMaxAggregateOutputType | null
  }

  type GetArchiveGroupByPayload<T extends ArchiveGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ArchiveGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ArchiveGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ArchiveGroupByOutputType[P]>
            : GetScalarType<T[P], ArchiveGroupByOutputType[P]>
        }
      >
    >


  export type ArchiveSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    serverName?: boolean
    game?: boolean
    saveSizeGB?: boolean
    archivedAt?: boolean
    createdAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["archive"]>

  export type ArchiveSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    serverName?: boolean
    game?: boolean
    saveSizeGB?: boolean
    archivedAt?: boolean
    createdAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["archive"]>

  export type ArchiveSelectScalar = {
    id?: boolean
    userId?: boolean
    serverName?: boolean
    game?: boolean
    saveSizeGB?: boolean
    archivedAt?: boolean
    createdAt?: boolean
  }

  export type ArchiveInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type ArchiveIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }

  export type $ArchivePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Archive"
    objects: {
      user: Prisma.$UserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      serverName: string
      game: string
      saveSizeGB: number
      archivedAt: Date
      createdAt: Date
    }, ExtArgs["result"]["archive"]>
    composites: {}
  }

  type ArchiveGetPayload<S extends boolean | null | undefined | ArchiveDefaultArgs> = $Result.GetResult<Prisma.$ArchivePayload, S>

  type ArchiveCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<ArchiveFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: ArchiveCountAggregateInputType | true
    }

  export interface ArchiveDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Archive'], meta: { name: 'Archive' } }
    /**
     * Find zero or one Archive that matches the filter.
     * @param {ArchiveFindUniqueArgs} args - Arguments to find a Archive
     * @example
     * // Get one Archive
     * const archive = await prisma.archive.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ArchiveFindUniqueArgs>(args: SelectSubset<T, ArchiveFindUniqueArgs<ExtArgs>>): Prisma__ArchiveClient<$Result.GetResult<Prisma.$ArchivePayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Archive that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {ArchiveFindUniqueOrThrowArgs} args - Arguments to find a Archive
     * @example
     * // Get one Archive
     * const archive = await prisma.archive.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ArchiveFindUniqueOrThrowArgs>(args: SelectSubset<T, ArchiveFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ArchiveClient<$Result.GetResult<Prisma.$ArchivePayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Archive that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArchiveFindFirstArgs} args - Arguments to find a Archive
     * @example
     * // Get one Archive
     * const archive = await prisma.archive.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ArchiveFindFirstArgs>(args?: SelectSubset<T, ArchiveFindFirstArgs<ExtArgs>>): Prisma__ArchiveClient<$Result.GetResult<Prisma.$ArchivePayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Archive that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArchiveFindFirstOrThrowArgs} args - Arguments to find a Archive
     * @example
     * // Get one Archive
     * const archive = await prisma.archive.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ArchiveFindFirstOrThrowArgs>(args?: SelectSubset<T, ArchiveFindFirstOrThrowArgs<ExtArgs>>): Prisma__ArchiveClient<$Result.GetResult<Prisma.$ArchivePayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Archives that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArchiveFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Archives
     * const archives = await prisma.archive.findMany()
     * 
     * // Get first 10 Archives
     * const archives = await prisma.archive.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const archiveWithIdOnly = await prisma.archive.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ArchiveFindManyArgs>(args?: SelectSubset<T, ArchiveFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ArchivePayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Archive.
     * @param {ArchiveCreateArgs} args - Arguments to create a Archive.
     * @example
     * // Create one Archive
     * const Archive = await prisma.archive.create({
     *   data: {
     *     // ... data to create a Archive
     *   }
     * })
     * 
     */
    create<T extends ArchiveCreateArgs>(args: SelectSubset<T, ArchiveCreateArgs<ExtArgs>>): Prisma__ArchiveClient<$Result.GetResult<Prisma.$ArchivePayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Archives.
     * @param {ArchiveCreateManyArgs} args - Arguments to create many Archives.
     * @example
     * // Create many Archives
     * const archive = await prisma.archive.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ArchiveCreateManyArgs>(args?: SelectSubset<T, ArchiveCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Archives and returns the data saved in the database.
     * @param {ArchiveCreateManyAndReturnArgs} args - Arguments to create many Archives.
     * @example
     * // Create many Archives
     * const archive = await prisma.archive.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Archives and only return the `id`
     * const archiveWithIdOnly = await prisma.archive.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ArchiveCreateManyAndReturnArgs>(args?: SelectSubset<T, ArchiveCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ArchivePayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Archive.
     * @param {ArchiveDeleteArgs} args - Arguments to delete one Archive.
     * @example
     * // Delete one Archive
     * const Archive = await prisma.archive.delete({
     *   where: {
     *     // ... filter to delete one Archive
     *   }
     * })
     * 
     */
    delete<T extends ArchiveDeleteArgs>(args: SelectSubset<T, ArchiveDeleteArgs<ExtArgs>>): Prisma__ArchiveClient<$Result.GetResult<Prisma.$ArchivePayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Archive.
     * @param {ArchiveUpdateArgs} args - Arguments to update one Archive.
     * @example
     * // Update one Archive
     * const archive = await prisma.archive.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ArchiveUpdateArgs>(args: SelectSubset<T, ArchiveUpdateArgs<ExtArgs>>): Prisma__ArchiveClient<$Result.GetResult<Prisma.$ArchivePayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Archives.
     * @param {ArchiveDeleteManyArgs} args - Arguments to filter Archives to delete.
     * @example
     * // Delete a few Archives
     * const { count } = await prisma.archive.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ArchiveDeleteManyArgs>(args?: SelectSubset<T, ArchiveDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Archives.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArchiveUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Archives
     * const archive = await prisma.archive.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ArchiveUpdateManyArgs>(args: SelectSubset<T, ArchiveUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Archive.
     * @param {ArchiveUpsertArgs} args - Arguments to update or create a Archive.
     * @example
     * // Update or create a Archive
     * const archive = await prisma.archive.upsert({
     *   create: {
     *     // ... data to create a Archive
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Archive we want to update
     *   }
     * })
     */
    upsert<T extends ArchiveUpsertArgs>(args: SelectSubset<T, ArchiveUpsertArgs<ExtArgs>>): Prisma__ArchiveClient<$Result.GetResult<Prisma.$ArchivePayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Archives.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArchiveCountArgs} args - Arguments to filter Archives to count.
     * @example
     * // Count the number of Archives
     * const count = await prisma.archive.count({
     *   where: {
     *     // ... the filter for the Archives we want to count
     *   }
     * })
    **/
    count<T extends ArchiveCountArgs>(
      args?: Subset<T, ArchiveCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ArchiveCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Archive.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArchiveAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ArchiveAggregateArgs>(args: Subset<T, ArchiveAggregateArgs>): Prisma.PrismaPromise<GetArchiveAggregateType<T>>

    /**
     * Group by Archive.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArchiveGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ArchiveGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ArchiveGroupByArgs['orderBy'] }
        : { orderBy?: ArchiveGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ArchiveGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetArchiveGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Archive model
   */
  readonly fields: ArchiveFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Archive.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ArchiveClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Archive model
   */ 
  interface ArchiveFieldRefs {
    readonly id: FieldRef<"Archive", 'String'>
    readonly userId: FieldRef<"Archive", 'String'>
    readonly serverName: FieldRef<"Archive", 'String'>
    readonly game: FieldRef<"Archive", 'String'>
    readonly saveSizeGB: FieldRef<"Archive", 'Float'>
    readonly archivedAt: FieldRef<"Archive", 'DateTime'>
    readonly createdAt: FieldRef<"Archive", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Archive findUnique
   */
  export type ArchiveFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveInclude<ExtArgs> | null
    /**
     * Filter, which Archive to fetch.
     */
    where: ArchiveWhereUniqueInput
  }

  /**
   * Archive findUniqueOrThrow
   */
  export type ArchiveFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveInclude<ExtArgs> | null
    /**
     * Filter, which Archive to fetch.
     */
    where: ArchiveWhereUniqueInput
  }

  /**
   * Archive findFirst
   */
  export type ArchiveFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveInclude<ExtArgs> | null
    /**
     * Filter, which Archive to fetch.
     */
    where?: ArchiveWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Archives to fetch.
     */
    orderBy?: ArchiveOrderByWithRelationInput | ArchiveOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Archives.
     */
    cursor?: ArchiveWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Archives from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Archives.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Archives.
     */
    distinct?: ArchiveScalarFieldEnum | ArchiveScalarFieldEnum[]
  }

  /**
   * Archive findFirstOrThrow
   */
  export type ArchiveFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveInclude<ExtArgs> | null
    /**
     * Filter, which Archive to fetch.
     */
    where?: ArchiveWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Archives to fetch.
     */
    orderBy?: ArchiveOrderByWithRelationInput | ArchiveOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Archives.
     */
    cursor?: ArchiveWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Archives from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Archives.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Archives.
     */
    distinct?: ArchiveScalarFieldEnum | ArchiveScalarFieldEnum[]
  }

  /**
   * Archive findMany
   */
  export type ArchiveFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveInclude<ExtArgs> | null
    /**
     * Filter, which Archives to fetch.
     */
    where?: ArchiveWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Archives to fetch.
     */
    orderBy?: ArchiveOrderByWithRelationInput | ArchiveOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Archives.
     */
    cursor?: ArchiveWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Archives from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Archives.
     */
    skip?: number
    distinct?: ArchiveScalarFieldEnum | ArchiveScalarFieldEnum[]
  }

  /**
   * Archive create
   */
  export type ArchiveCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveInclude<ExtArgs> | null
    /**
     * The data needed to create a Archive.
     */
    data: XOR<ArchiveCreateInput, ArchiveUncheckedCreateInput>
  }

  /**
   * Archive createMany
   */
  export type ArchiveCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Archives.
     */
    data: ArchiveCreateManyInput | ArchiveCreateManyInput[]
  }

  /**
   * Archive createManyAndReturn
   */
  export type ArchiveCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Archives.
     */
    data: ArchiveCreateManyInput | ArchiveCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Archive update
   */
  export type ArchiveUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveInclude<ExtArgs> | null
    /**
     * The data needed to update a Archive.
     */
    data: XOR<ArchiveUpdateInput, ArchiveUncheckedUpdateInput>
    /**
     * Choose, which Archive to update.
     */
    where: ArchiveWhereUniqueInput
  }

  /**
   * Archive updateMany
   */
  export type ArchiveUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Archives.
     */
    data: XOR<ArchiveUpdateManyMutationInput, ArchiveUncheckedUpdateManyInput>
    /**
     * Filter which Archives to update
     */
    where?: ArchiveWhereInput
  }

  /**
   * Archive upsert
   */
  export type ArchiveUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveInclude<ExtArgs> | null
    /**
     * The filter to search for the Archive to update in case it exists.
     */
    where: ArchiveWhereUniqueInput
    /**
     * In case the Archive found by the `where` argument doesn't exist, create a new Archive with this data.
     */
    create: XOR<ArchiveCreateInput, ArchiveUncheckedCreateInput>
    /**
     * In case the Archive was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ArchiveUpdateInput, ArchiveUncheckedUpdateInput>
  }

  /**
   * Archive delete
   */
  export type ArchiveDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveInclude<ExtArgs> | null
    /**
     * Filter which Archive to delete.
     */
    where: ArchiveWhereUniqueInput
  }

  /**
   * Archive deleteMany
   */
  export type ArchiveDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Archives to delete
     */
    where?: ArchiveWhereInput
  }

  /**
   * Archive without action
   */
  export type ArchiveDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Archive
     */
    select?: ArchiveSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArchiveInclude<ExtArgs> | null
  }


  /**
   * Model ActivityLog
   */

  export type AggregateActivityLog = {
    _count: ActivityLogCountAggregateOutputType | null
    _min: ActivityLogMinAggregateOutputType | null
    _max: ActivityLogMaxAggregateOutputType | null
  }

  export type ActivityLogMinAggregateOutputType = {
    id: string | null
    userId: string | null
    action: string | null
    details: string | null
    createdAt: Date | null
  }

  export type ActivityLogMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    action: string | null
    details: string | null
    createdAt: Date | null
  }

  export type ActivityLogCountAggregateOutputType = {
    id: number
    userId: number
    action: number
    details: number
    createdAt: number
    _all: number
  }


  export type ActivityLogMinAggregateInputType = {
    id?: true
    userId?: true
    action?: true
    details?: true
    createdAt?: true
  }

  export type ActivityLogMaxAggregateInputType = {
    id?: true
    userId?: true
    action?: true
    details?: true
    createdAt?: true
  }

  export type ActivityLogCountAggregateInputType = {
    id?: true
    userId?: true
    action?: true
    details?: true
    createdAt?: true
    _all?: true
  }

  export type ActivityLogAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ActivityLog to aggregate.
     */
    where?: ActivityLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ActivityLogs to fetch.
     */
    orderBy?: ActivityLogOrderByWithRelationInput | ActivityLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ActivityLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ActivityLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ActivityLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ActivityLogs
    **/
    _count?: true | ActivityLogCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ActivityLogMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ActivityLogMaxAggregateInputType
  }

  export type GetActivityLogAggregateType<T extends ActivityLogAggregateArgs> = {
        [P in keyof T & keyof AggregateActivityLog]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateActivityLog[P]>
      : GetScalarType<T[P], AggregateActivityLog[P]>
  }




  export type ActivityLogGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ActivityLogWhereInput
    orderBy?: ActivityLogOrderByWithAggregationInput | ActivityLogOrderByWithAggregationInput[]
    by: ActivityLogScalarFieldEnum[] | ActivityLogScalarFieldEnum
    having?: ActivityLogScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ActivityLogCountAggregateInputType | true
    _min?: ActivityLogMinAggregateInputType
    _max?: ActivityLogMaxAggregateInputType
  }

  export type ActivityLogGroupByOutputType = {
    id: string
    userId: string
    action: string
    details: string
    createdAt: Date
    _count: ActivityLogCountAggregateOutputType | null
    _min: ActivityLogMinAggregateOutputType | null
    _max: ActivityLogMaxAggregateOutputType | null
  }

  type GetActivityLogGroupByPayload<T extends ActivityLogGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ActivityLogGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ActivityLogGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ActivityLogGroupByOutputType[P]>
            : GetScalarType<T[P], ActivityLogGroupByOutputType[P]>
        }
      >
    >


  export type ActivityLogSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    action?: boolean
    details?: boolean
    createdAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["activityLog"]>

  export type ActivityLogSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    action?: boolean
    details?: boolean
    createdAt?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["activityLog"]>

  export type ActivityLogSelectScalar = {
    id?: boolean
    userId?: boolean
    action?: boolean
    details?: boolean
    createdAt?: boolean
  }

  export type ActivityLogInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type ActivityLogIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
  }

  export type $ActivityLogPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ActivityLog"
    objects: {
      user: Prisma.$UserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      action: string
      details: string
      createdAt: Date
    }, ExtArgs["result"]["activityLog"]>
    composites: {}
  }

  type ActivityLogGetPayload<S extends boolean | null | undefined | ActivityLogDefaultArgs> = $Result.GetResult<Prisma.$ActivityLogPayload, S>

  type ActivityLogCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<ActivityLogFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: ActivityLogCountAggregateInputType | true
    }

  export interface ActivityLogDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ActivityLog'], meta: { name: 'ActivityLog' } }
    /**
     * Find zero or one ActivityLog that matches the filter.
     * @param {ActivityLogFindUniqueArgs} args - Arguments to find a ActivityLog
     * @example
     * // Get one ActivityLog
     * const activityLog = await prisma.activityLog.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ActivityLogFindUniqueArgs>(args: SelectSubset<T, ActivityLogFindUniqueArgs<ExtArgs>>): Prisma__ActivityLogClient<$Result.GetResult<Prisma.$ActivityLogPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one ActivityLog that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {ActivityLogFindUniqueOrThrowArgs} args - Arguments to find a ActivityLog
     * @example
     * // Get one ActivityLog
     * const activityLog = await prisma.activityLog.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ActivityLogFindUniqueOrThrowArgs>(args: SelectSubset<T, ActivityLogFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ActivityLogClient<$Result.GetResult<Prisma.$ActivityLogPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first ActivityLog that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActivityLogFindFirstArgs} args - Arguments to find a ActivityLog
     * @example
     * // Get one ActivityLog
     * const activityLog = await prisma.activityLog.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ActivityLogFindFirstArgs>(args?: SelectSubset<T, ActivityLogFindFirstArgs<ExtArgs>>): Prisma__ActivityLogClient<$Result.GetResult<Prisma.$ActivityLogPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first ActivityLog that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActivityLogFindFirstOrThrowArgs} args - Arguments to find a ActivityLog
     * @example
     * // Get one ActivityLog
     * const activityLog = await prisma.activityLog.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ActivityLogFindFirstOrThrowArgs>(args?: SelectSubset<T, ActivityLogFindFirstOrThrowArgs<ExtArgs>>): Prisma__ActivityLogClient<$Result.GetResult<Prisma.$ActivityLogPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more ActivityLogs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActivityLogFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ActivityLogs
     * const activityLogs = await prisma.activityLog.findMany()
     * 
     * // Get first 10 ActivityLogs
     * const activityLogs = await prisma.activityLog.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const activityLogWithIdOnly = await prisma.activityLog.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ActivityLogFindManyArgs>(args?: SelectSubset<T, ActivityLogFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ActivityLogPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a ActivityLog.
     * @param {ActivityLogCreateArgs} args - Arguments to create a ActivityLog.
     * @example
     * // Create one ActivityLog
     * const ActivityLog = await prisma.activityLog.create({
     *   data: {
     *     // ... data to create a ActivityLog
     *   }
     * })
     * 
     */
    create<T extends ActivityLogCreateArgs>(args: SelectSubset<T, ActivityLogCreateArgs<ExtArgs>>): Prisma__ActivityLogClient<$Result.GetResult<Prisma.$ActivityLogPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many ActivityLogs.
     * @param {ActivityLogCreateManyArgs} args - Arguments to create many ActivityLogs.
     * @example
     * // Create many ActivityLogs
     * const activityLog = await prisma.activityLog.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ActivityLogCreateManyArgs>(args?: SelectSubset<T, ActivityLogCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ActivityLogs and returns the data saved in the database.
     * @param {ActivityLogCreateManyAndReturnArgs} args - Arguments to create many ActivityLogs.
     * @example
     * // Create many ActivityLogs
     * const activityLog = await prisma.activityLog.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ActivityLogs and only return the `id`
     * const activityLogWithIdOnly = await prisma.activityLog.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ActivityLogCreateManyAndReturnArgs>(args?: SelectSubset<T, ActivityLogCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ActivityLogPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a ActivityLog.
     * @param {ActivityLogDeleteArgs} args - Arguments to delete one ActivityLog.
     * @example
     * // Delete one ActivityLog
     * const ActivityLog = await prisma.activityLog.delete({
     *   where: {
     *     // ... filter to delete one ActivityLog
     *   }
     * })
     * 
     */
    delete<T extends ActivityLogDeleteArgs>(args: SelectSubset<T, ActivityLogDeleteArgs<ExtArgs>>): Prisma__ActivityLogClient<$Result.GetResult<Prisma.$ActivityLogPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one ActivityLog.
     * @param {ActivityLogUpdateArgs} args - Arguments to update one ActivityLog.
     * @example
     * // Update one ActivityLog
     * const activityLog = await prisma.activityLog.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ActivityLogUpdateArgs>(args: SelectSubset<T, ActivityLogUpdateArgs<ExtArgs>>): Prisma__ActivityLogClient<$Result.GetResult<Prisma.$ActivityLogPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more ActivityLogs.
     * @param {ActivityLogDeleteManyArgs} args - Arguments to filter ActivityLogs to delete.
     * @example
     * // Delete a few ActivityLogs
     * const { count } = await prisma.activityLog.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ActivityLogDeleteManyArgs>(args?: SelectSubset<T, ActivityLogDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ActivityLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActivityLogUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ActivityLogs
     * const activityLog = await prisma.activityLog.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ActivityLogUpdateManyArgs>(args: SelectSubset<T, ActivityLogUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one ActivityLog.
     * @param {ActivityLogUpsertArgs} args - Arguments to update or create a ActivityLog.
     * @example
     * // Update or create a ActivityLog
     * const activityLog = await prisma.activityLog.upsert({
     *   create: {
     *     // ... data to create a ActivityLog
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ActivityLog we want to update
     *   }
     * })
     */
    upsert<T extends ActivityLogUpsertArgs>(args: SelectSubset<T, ActivityLogUpsertArgs<ExtArgs>>): Prisma__ActivityLogClient<$Result.GetResult<Prisma.$ActivityLogPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of ActivityLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActivityLogCountArgs} args - Arguments to filter ActivityLogs to count.
     * @example
     * // Count the number of ActivityLogs
     * const count = await prisma.activityLog.count({
     *   where: {
     *     // ... the filter for the ActivityLogs we want to count
     *   }
     * })
    **/
    count<T extends ActivityLogCountArgs>(
      args?: Subset<T, ActivityLogCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ActivityLogCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ActivityLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActivityLogAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ActivityLogAggregateArgs>(args: Subset<T, ActivityLogAggregateArgs>): Prisma.PrismaPromise<GetActivityLogAggregateType<T>>

    /**
     * Group by ActivityLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ActivityLogGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ActivityLogGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ActivityLogGroupByArgs['orderBy'] }
        : { orderBy?: ActivityLogGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ActivityLogGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetActivityLogGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ActivityLog model
   */
  readonly fields: ActivityLogFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ActivityLog.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ActivityLogClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ActivityLog model
   */ 
  interface ActivityLogFieldRefs {
    readonly id: FieldRef<"ActivityLog", 'String'>
    readonly userId: FieldRef<"ActivityLog", 'String'>
    readonly action: FieldRef<"ActivityLog", 'String'>
    readonly details: FieldRef<"ActivityLog", 'String'>
    readonly createdAt: FieldRef<"ActivityLog", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ActivityLog findUnique
   */
  export type ActivityLogFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogInclude<ExtArgs> | null
    /**
     * Filter, which ActivityLog to fetch.
     */
    where: ActivityLogWhereUniqueInput
  }

  /**
   * ActivityLog findUniqueOrThrow
   */
  export type ActivityLogFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogInclude<ExtArgs> | null
    /**
     * Filter, which ActivityLog to fetch.
     */
    where: ActivityLogWhereUniqueInput
  }

  /**
   * ActivityLog findFirst
   */
  export type ActivityLogFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogInclude<ExtArgs> | null
    /**
     * Filter, which ActivityLog to fetch.
     */
    where?: ActivityLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ActivityLogs to fetch.
     */
    orderBy?: ActivityLogOrderByWithRelationInput | ActivityLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ActivityLogs.
     */
    cursor?: ActivityLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ActivityLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ActivityLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ActivityLogs.
     */
    distinct?: ActivityLogScalarFieldEnum | ActivityLogScalarFieldEnum[]
  }

  /**
   * ActivityLog findFirstOrThrow
   */
  export type ActivityLogFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogInclude<ExtArgs> | null
    /**
     * Filter, which ActivityLog to fetch.
     */
    where?: ActivityLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ActivityLogs to fetch.
     */
    orderBy?: ActivityLogOrderByWithRelationInput | ActivityLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ActivityLogs.
     */
    cursor?: ActivityLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ActivityLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ActivityLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ActivityLogs.
     */
    distinct?: ActivityLogScalarFieldEnum | ActivityLogScalarFieldEnum[]
  }

  /**
   * ActivityLog findMany
   */
  export type ActivityLogFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogInclude<ExtArgs> | null
    /**
     * Filter, which ActivityLogs to fetch.
     */
    where?: ActivityLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ActivityLogs to fetch.
     */
    orderBy?: ActivityLogOrderByWithRelationInput | ActivityLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ActivityLogs.
     */
    cursor?: ActivityLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ActivityLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ActivityLogs.
     */
    skip?: number
    distinct?: ActivityLogScalarFieldEnum | ActivityLogScalarFieldEnum[]
  }

  /**
   * ActivityLog create
   */
  export type ActivityLogCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogInclude<ExtArgs> | null
    /**
     * The data needed to create a ActivityLog.
     */
    data: XOR<ActivityLogCreateInput, ActivityLogUncheckedCreateInput>
  }

  /**
   * ActivityLog createMany
   */
  export type ActivityLogCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ActivityLogs.
     */
    data: ActivityLogCreateManyInput | ActivityLogCreateManyInput[]
  }

  /**
   * ActivityLog createManyAndReturn
   */
  export type ActivityLogCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many ActivityLogs.
     */
    data: ActivityLogCreateManyInput | ActivityLogCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * ActivityLog update
   */
  export type ActivityLogUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogInclude<ExtArgs> | null
    /**
     * The data needed to update a ActivityLog.
     */
    data: XOR<ActivityLogUpdateInput, ActivityLogUncheckedUpdateInput>
    /**
     * Choose, which ActivityLog to update.
     */
    where: ActivityLogWhereUniqueInput
  }

  /**
   * ActivityLog updateMany
   */
  export type ActivityLogUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ActivityLogs.
     */
    data: XOR<ActivityLogUpdateManyMutationInput, ActivityLogUncheckedUpdateManyInput>
    /**
     * Filter which ActivityLogs to update
     */
    where?: ActivityLogWhereInput
  }

  /**
   * ActivityLog upsert
   */
  export type ActivityLogUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogInclude<ExtArgs> | null
    /**
     * The filter to search for the ActivityLog to update in case it exists.
     */
    where: ActivityLogWhereUniqueInput
    /**
     * In case the ActivityLog found by the `where` argument doesn't exist, create a new ActivityLog with this data.
     */
    create: XOR<ActivityLogCreateInput, ActivityLogUncheckedCreateInput>
    /**
     * In case the ActivityLog was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ActivityLogUpdateInput, ActivityLogUncheckedUpdateInput>
  }

  /**
   * ActivityLog delete
   */
  export type ActivityLogDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogInclude<ExtArgs> | null
    /**
     * Filter which ActivityLog to delete.
     */
    where: ActivityLogWhereUniqueInput
  }

  /**
   * ActivityLog deleteMany
   */
  export type ActivityLogDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ActivityLogs to delete
     */
    where?: ActivityLogWhereInput
  }

  /**
   * ActivityLog without action
   */
  export type ActivityLogDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ActivityLog
     */
    select?: ActivityLogSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ActivityLogInclude<ExtArgs> | null
  }


  /**
   * Model Backup
   */

  export type AggregateBackup = {
    _count: BackupCountAggregateOutputType | null
    _avg: BackupAvgAggregateOutputType | null
    _sum: BackupSumAggregateOutputType | null
    _min: BackupMinAggregateOutputType | null
    _max: BackupMaxAggregateOutputType | null
  }

  export type BackupAvgAggregateOutputType = {
    fileSizeMB: number | null
  }

  export type BackupSumAggregateOutputType = {
    fileSizeMB: number | null
  }

  export type BackupMinAggregateOutputType = {
    id: string | null
    serverId: string | null
    userId: string | null
    name: string | null
    game: string | null
    filePath: string | null
    fileSizeMB: number | null
    backupType: string | null
    createdAt: Date | null
  }

  export type BackupMaxAggregateOutputType = {
    id: string | null
    serverId: string | null
    userId: string | null
    name: string | null
    game: string | null
    filePath: string | null
    fileSizeMB: number | null
    backupType: string | null
    createdAt: Date | null
  }

  export type BackupCountAggregateOutputType = {
    id: number
    serverId: number
    userId: number
    name: number
    game: number
    filePath: number
    fileSizeMB: number
    backupType: number
    createdAt: number
    _all: number
  }


  export type BackupAvgAggregateInputType = {
    fileSizeMB?: true
  }

  export type BackupSumAggregateInputType = {
    fileSizeMB?: true
  }

  export type BackupMinAggregateInputType = {
    id?: true
    serverId?: true
    userId?: true
    name?: true
    game?: true
    filePath?: true
    fileSizeMB?: true
    backupType?: true
    createdAt?: true
  }

  export type BackupMaxAggregateInputType = {
    id?: true
    serverId?: true
    userId?: true
    name?: true
    game?: true
    filePath?: true
    fileSizeMB?: true
    backupType?: true
    createdAt?: true
  }

  export type BackupCountAggregateInputType = {
    id?: true
    serverId?: true
    userId?: true
    name?: true
    game?: true
    filePath?: true
    fileSizeMB?: true
    backupType?: true
    createdAt?: true
    _all?: true
  }

  export type BackupAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Backup to aggregate.
     */
    where?: BackupWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Backups to fetch.
     */
    orderBy?: BackupOrderByWithRelationInput | BackupOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: BackupWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Backups from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Backups.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Backups
    **/
    _count?: true | BackupCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: BackupAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: BackupSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: BackupMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: BackupMaxAggregateInputType
  }

  export type GetBackupAggregateType<T extends BackupAggregateArgs> = {
        [P in keyof T & keyof AggregateBackup]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateBackup[P]>
      : GetScalarType<T[P], AggregateBackup[P]>
  }




  export type BackupGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: BackupWhereInput
    orderBy?: BackupOrderByWithAggregationInput | BackupOrderByWithAggregationInput[]
    by: BackupScalarFieldEnum[] | BackupScalarFieldEnum
    having?: BackupScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: BackupCountAggregateInputType | true
    _avg?: BackupAvgAggregateInputType
    _sum?: BackupSumAggregateInputType
    _min?: BackupMinAggregateInputType
    _max?: BackupMaxAggregateInputType
  }

  export type BackupGroupByOutputType = {
    id: string
    serverId: string
    userId: string
    name: string
    game: string
    filePath: string
    fileSizeMB: number
    backupType: string
    createdAt: Date
    _count: BackupCountAggregateOutputType | null
    _avg: BackupAvgAggregateOutputType | null
    _sum: BackupSumAggregateOutputType | null
    _min: BackupMinAggregateOutputType | null
    _max: BackupMaxAggregateOutputType | null
  }

  type GetBackupGroupByPayload<T extends BackupGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<BackupGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof BackupGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], BackupGroupByOutputType[P]>
            : GetScalarType<T[P], BackupGroupByOutputType[P]>
        }
      >
    >


  export type BackupSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    serverId?: boolean
    userId?: boolean
    name?: boolean
    game?: boolean
    filePath?: boolean
    fileSizeMB?: boolean
    backupType?: boolean
    createdAt?: boolean
    server?: boolean | ServerDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["backup"]>

  export type BackupSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    serverId?: boolean
    userId?: boolean
    name?: boolean
    game?: boolean
    filePath?: boolean
    fileSizeMB?: boolean
    backupType?: boolean
    createdAt?: boolean
    server?: boolean | ServerDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["backup"]>

  export type BackupSelectScalar = {
    id?: boolean
    serverId?: boolean
    userId?: boolean
    name?: boolean
    game?: boolean
    filePath?: boolean
    fileSizeMB?: boolean
    backupType?: boolean
    createdAt?: boolean
  }

  export type BackupInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    server?: boolean | ServerDefaultArgs<ExtArgs>
  }
  export type BackupIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    server?: boolean | ServerDefaultArgs<ExtArgs>
  }

  export type $BackupPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Backup"
    objects: {
      server: Prisma.$ServerPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      serverId: string
      userId: string
      name: string
      game: string
      filePath: string
      fileSizeMB: number
      backupType: string
      createdAt: Date
    }, ExtArgs["result"]["backup"]>
    composites: {}
  }

  type BackupGetPayload<S extends boolean | null | undefined | BackupDefaultArgs> = $Result.GetResult<Prisma.$BackupPayload, S>

  type BackupCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<BackupFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: BackupCountAggregateInputType | true
    }

  export interface BackupDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Backup'], meta: { name: 'Backup' } }
    /**
     * Find zero or one Backup that matches the filter.
     * @param {BackupFindUniqueArgs} args - Arguments to find a Backup
     * @example
     * // Get one Backup
     * const backup = await prisma.backup.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends BackupFindUniqueArgs>(args: SelectSubset<T, BackupFindUniqueArgs<ExtArgs>>): Prisma__BackupClient<$Result.GetResult<Prisma.$BackupPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Backup that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {BackupFindUniqueOrThrowArgs} args - Arguments to find a Backup
     * @example
     * // Get one Backup
     * const backup = await prisma.backup.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends BackupFindUniqueOrThrowArgs>(args: SelectSubset<T, BackupFindUniqueOrThrowArgs<ExtArgs>>): Prisma__BackupClient<$Result.GetResult<Prisma.$BackupPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Backup that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BackupFindFirstArgs} args - Arguments to find a Backup
     * @example
     * // Get one Backup
     * const backup = await prisma.backup.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends BackupFindFirstArgs>(args?: SelectSubset<T, BackupFindFirstArgs<ExtArgs>>): Prisma__BackupClient<$Result.GetResult<Prisma.$BackupPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Backup that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BackupFindFirstOrThrowArgs} args - Arguments to find a Backup
     * @example
     * // Get one Backup
     * const backup = await prisma.backup.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends BackupFindFirstOrThrowArgs>(args?: SelectSubset<T, BackupFindFirstOrThrowArgs<ExtArgs>>): Prisma__BackupClient<$Result.GetResult<Prisma.$BackupPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Backups that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BackupFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Backups
     * const backups = await prisma.backup.findMany()
     * 
     * // Get first 10 Backups
     * const backups = await prisma.backup.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const backupWithIdOnly = await prisma.backup.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends BackupFindManyArgs>(args?: SelectSubset<T, BackupFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BackupPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Backup.
     * @param {BackupCreateArgs} args - Arguments to create a Backup.
     * @example
     * // Create one Backup
     * const Backup = await prisma.backup.create({
     *   data: {
     *     // ... data to create a Backup
     *   }
     * })
     * 
     */
    create<T extends BackupCreateArgs>(args: SelectSubset<T, BackupCreateArgs<ExtArgs>>): Prisma__BackupClient<$Result.GetResult<Prisma.$BackupPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Backups.
     * @param {BackupCreateManyArgs} args - Arguments to create many Backups.
     * @example
     * // Create many Backups
     * const backup = await prisma.backup.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends BackupCreateManyArgs>(args?: SelectSubset<T, BackupCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Backups and returns the data saved in the database.
     * @param {BackupCreateManyAndReturnArgs} args - Arguments to create many Backups.
     * @example
     * // Create many Backups
     * const backup = await prisma.backup.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Backups and only return the `id`
     * const backupWithIdOnly = await prisma.backup.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends BackupCreateManyAndReturnArgs>(args?: SelectSubset<T, BackupCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$BackupPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Backup.
     * @param {BackupDeleteArgs} args - Arguments to delete one Backup.
     * @example
     * // Delete one Backup
     * const Backup = await prisma.backup.delete({
     *   where: {
     *     // ... filter to delete one Backup
     *   }
     * })
     * 
     */
    delete<T extends BackupDeleteArgs>(args: SelectSubset<T, BackupDeleteArgs<ExtArgs>>): Prisma__BackupClient<$Result.GetResult<Prisma.$BackupPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Backup.
     * @param {BackupUpdateArgs} args - Arguments to update one Backup.
     * @example
     * // Update one Backup
     * const backup = await prisma.backup.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends BackupUpdateArgs>(args: SelectSubset<T, BackupUpdateArgs<ExtArgs>>): Prisma__BackupClient<$Result.GetResult<Prisma.$BackupPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Backups.
     * @param {BackupDeleteManyArgs} args - Arguments to filter Backups to delete.
     * @example
     * // Delete a few Backups
     * const { count } = await prisma.backup.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends BackupDeleteManyArgs>(args?: SelectSubset<T, BackupDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Backups.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BackupUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Backups
     * const backup = await prisma.backup.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends BackupUpdateManyArgs>(args: SelectSubset<T, BackupUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Backup.
     * @param {BackupUpsertArgs} args - Arguments to update or create a Backup.
     * @example
     * // Update or create a Backup
     * const backup = await prisma.backup.upsert({
     *   create: {
     *     // ... data to create a Backup
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Backup we want to update
     *   }
     * })
     */
    upsert<T extends BackupUpsertArgs>(args: SelectSubset<T, BackupUpsertArgs<ExtArgs>>): Prisma__BackupClient<$Result.GetResult<Prisma.$BackupPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Backups.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BackupCountArgs} args - Arguments to filter Backups to count.
     * @example
     * // Count the number of Backups
     * const count = await prisma.backup.count({
     *   where: {
     *     // ... the filter for the Backups we want to count
     *   }
     * })
    **/
    count<T extends BackupCountArgs>(
      args?: Subset<T, BackupCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], BackupCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Backup.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BackupAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends BackupAggregateArgs>(args: Subset<T, BackupAggregateArgs>): Prisma.PrismaPromise<GetBackupAggregateType<T>>

    /**
     * Group by Backup.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {BackupGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends BackupGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: BackupGroupByArgs['orderBy'] }
        : { orderBy?: BackupGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, BackupGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetBackupGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Backup model
   */
  readonly fields: BackupFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Backup.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__BackupClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    server<T extends ServerDefaultArgs<ExtArgs> = {}>(args?: Subset<T, ServerDefaultArgs<ExtArgs>>): Prisma__ServerClient<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Backup model
   */ 
  interface BackupFieldRefs {
    readonly id: FieldRef<"Backup", 'String'>
    readonly serverId: FieldRef<"Backup", 'String'>
    readonly userId: FieldRef<"Backup", 'String'>
    readonly name: FieldRef<"Backup", 'String'>
    readonly game: FieldRef<"Backup", 'String'>
    readonly filePath: FieldRef<"Backup", 'String'>
    readonly fileSizeMB: FieldRef<"Backup", 'Float'>
    readonly backupType: FieldRef<"Backup", 'String'>
    readonly createdAt: FieldRef<"Backup", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Backup findUnique
   */
  export type BackupFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupInclude<ExtArgs> | null
    /**
     * Filter, which Backup to fetch.
     */
    where: BackupWhereUniqueInput
  }

  /**
   * Backup findUniqueOrThrow
   */
  export type BackupFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupInclude<ExtArgs> | null
    /**
     * Filter, which Backup to fetch.
     */
    where: BackupWhereUniqueInput
  }

  /**
   * Backup findFirst
   */
  export type BackupFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupInclude<ExtArgs> | null
    /**
     * Filter, which Backup to fetch.
     */
    where?: BackupWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Backups to fetch.
     */
    orderBy?: BackupOrderByWithRelationInput | BackupOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Backups.
     */
    cursor?: BackupWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Backups from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Backups.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Backups.
     */
    distinct?: BackupScalarFieldEnum | BackupScalarFieldEnum[]
  }

  /**
   * Backup findFirstOrThrow
   */
  export type BackupFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupInclude<ExtArgs> | null
    /**
     * Filter, which Backup to fetch.
     */
    where?: BackupWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Backups to fetch.
     */
    orderBy?: BackupOrderByWithRelationInput | BackupOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Backups.
     */
    cursor?: BackupWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Backups from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Backups.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Backups.
     */
    distinct?: BackupScalarFieldEnum | BackupScalarFieldEnum[]
  }

  /**
   * Backup findMany
   */
  export type BackupFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupInclude<ExtArgs> | null
    /**
     * Filter, which Backups to fetch.
     */
    where?: BackupWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Backups to fetch.
     */
    orderBy?: BackupOrderByWithRelationInput | BackupOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Backups.
     */
    cursor?: BackupWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Backups from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Backups.
     */
    skip?: number
    distinct?: BackupScalarFieldEnum | BackupScalarFieldEnum[]
  }

  /**
   * Backup create
   */
  export type BackupCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupInclude<ExtArgs> | null
    /**
     * The data needed to create a Backup.
     */
    data: XOR<BackupCreateInput, BackupUncheckedCreateInput>
  }

  /**
   * Backup createMany
   */
  export type BackupCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Backups.
     */
    data: BackupCreateManyInput | BackupCreateManyInput[]
  }

  /**
   * Backup createManyAndReturn
   */
  export type BackupCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Backups.
     */
    data: BackupCreateManyInput | BackupCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Backup update
   */
  export type BackupUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupInclude<ExtArgs> | null
    /**
     * The data needed to update a Backup.
     */
    data: XOR<BackupUpdateInput, BackupUncheckedUpdateInput>
    /**
     * Choose, which Backup to update.
     */
    where: BackupWhereUniqueInput
  }

  /**
   * Backup updateMany
   */
  export type BackupUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Backups.
     */
    data: XOR<BackupUpdateManyMutationInput, BackupUncheckedUpdateManyInput>
    /**
     * Filter which Backups to update
     */
    where?: BackupWhereInput
  }

  /**
   * Backup upsert
   */
  export type BackupUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupInclude<ExtArgs> | null
    /**
     * The filter to search for the Backup to update in case it exists.
     */
    where: BackupWhereUniqueInput
    /**
     * In case the Backup found by the `where` argument doesn't exist, create a new Backup with this data.
     */
    create: XOR<BackupCreateInput, BackupUncheckedCreateInput>
    /**
     * In case the Backup was found with the provided `where` argument, update it with this data.
     */
    update: XOR<BackupUpdateInput, BackupUncheckedUpdateInput>
  }

  /**
   * Backup delete
   */
  export type BackupDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupInclude<ExtArgs> | null
    /**
     * Filter which Backup to delete.
     */
    where: BackupWhereUniqueInput
  }

  /**
   * Backup deleteMany
   */
  export type BackupDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Backups to delete
     */
    where?: BackupWhereInput
  }

  /**
   * Backup without action
   */
  export type BackupDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Backup
     */
    select?: BackupSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: BackupInclude<ExtArgs> | null
  }


  /**
   * Model Collaborator
   */

  export type AggregateCollaborator = {
    _count: CollaboratorCountAggregateOutputType | null
    _min: CollaboratorMinAggregateOutputType | null
    _max: CollaboratorMaxAggregateOutputType | null
  }

  export type CollaboratorMinAggregateOutputType = {
    id: string | null
    serverId: string | null
    userId: string | null
    role: string | null
    createdAt: Date | null
  }

  export type CollaboratorMaxAggregateOutputType = {
    id: string | null
    serverId: string | null
    userId: string | null
    role: string | null
    createdAt: Date | null
  }

  export type CollaboratorCountAggregateOutputType = {
    id: number
    serverId: number
    userId: number
    role: number
    createdAt: number
    _all: number
  }


  export type CollaboratorMinAggregateInputType = {
    id?: true
    serverId?: true
    userId?: true
    role?: true
    createdAt?: true
  }

  export type CollaboratorMaxAggregateInputType = {
    id?: true
    serverId?: true
    userId?: true
    role?: true
    createdAt?: true
  }

  export type CollaboratorCountAggregateInputType = {
    id?: true
    serverId?: true
    userId?: true
    role?: true
    createdAt?: true
    _all?: true
  }

  export type CollaboratorAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Collaborator to aggregate.
     */
    where?: CollaboratorWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Collaborators to fetch.
     */
    orderBy?: CollaboratorOrderByWithRelationInput | CollaboratorOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CollaboratorWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Collaborators from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Collaborators.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Collaborators
    **/
    _count?: true | CollaboratorCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CollaboratorMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CollaboratorMaxAggregateInputType
  }

  export type GetCollaboratorAggregateType<T extends CollaboratorAggregateArgs> = {
        [P in keyof T & keyof AggregateCollaborator]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCollaborator[P]>
      : GetScalarType<T[P], AggregateCollaborator[P]>
  }




  export type CollaboratorGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CollaboratorWhereInput
    orderBy?: CollaboratorOrderByWithAggregationInput | CollaboratorOrderByWithAggregationInput[]
    by: CollaboratorScalarFieldEnum[] | CollaboratorScalarFieldEnum
    having?: CollaboratorScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CollaboratorCountAggregateInputType | true
    _min?: CollaboratorMinAggregateInputType
    _max?: CollaboratorMaxAggregateInputType
  }

  export type CollaboratorGroupByOutputType = {
    id: string
    serverId: string
    userId: string
    role: string
    createdAt: Date
    _count: CollaboratorCountAggregateOutputType | null
    _min: CollaboratorMinAggregateOutputType | null
    _max: CollaboratorMaxAggregateOutputType | null
  }

  type GetCollaboratorGroupByPayload<T extends CollaboratorGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CollaboratorGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CollaboratorGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CollaboratorGroupByOutputType[P]>
            : GetScalarType<T[P], CollaboratorGroupByOutputType[P]>
        }
      >
    >


  export type CollaboratorSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    serverId?: boolean
    userId?: boolean
    role?: boolean
    createdAt?: boolean
    server?: boolean | ServerDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["collaborator"]>

  export type CollaboratorSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    serverId?: boolean
    userId?: boolean
    role?: boolean
    createdAt?: boolean
    server?: boolean | ServerDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["collaborator"]>

  export type CollaboratorSelectScalar = {
    id?: boolean
    serverId?: boolean
    userId?: boolean
    role?: boolean
    createdAt?: boolean
  }

  export type CollaboratorInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    server?: boolean | ServerDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
  }
  export type CollaboratorIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    server?: boolean | ServerDefaultArgs<ExtArgs>
    user?: boolean | UserDefaultArgs<ExtArgs>
  }

  export type $CollaboratorPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Collaborator"
    objects: {
      server: Prisma.$ServerPayload<ExtArgs>
      user: Prisma.$UserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      serverId: string
      userId: string
      role: string
      createdAt: Date
    }, ExtArgs["result"]["collaborator"]>
    composites: {}
  }

  type CollaboratorGetPayload<S extends boolean | null | undefined | CollaboratorDefaultArgs> = $Result.GetResult<Prisma.$CollaboratorPayload, S>

  type CollaboratorCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<CollaboratorFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: CollaboratorCountAggregateInputType | true
    }

  export interface CollaboratorDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Collaborator'], meta: { name: 'Collaborator' } }
    /**
     * Find zero or one Collaborator that matches the filter.
     * @param {CollaboratorFindUniqueArgs} args - Arguments to find a Collaborator
     * @example
     * // Get one Collaborator
     * const collaborator = await prisma.collaborator.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CollaboratorFindUniqueArgs>(args: SelectSubset<T, CollaboratorFindUniqueArgs<ExtArgs>>): Prisma__CollaboratorClient<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Collaborator that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {CollaboratorFindUniqueOrThrowArgs} args - Arguments to find a Collaborator
     * @example
     * // Get one Collaborator
     * const collaborator = await prisma.collaborator.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CollaboratorFindUniqueOrThrowArgs>(args: SelectSubset<T, CollaboratorFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CollaboratorClient<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Collaborator that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollaboratorFindFirstArgs} args - Arguments to find a Collaborator
     * @example
     * // Get one Collaborator
     * const collaborator = await prisma.collaborator.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CollaboratorFindFirstArgs>(args?: SelectSubset<T, CollaboratorFindFirstArgs<ExtArgs>>): Prisma__CollaboratorClient<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Collaborator that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollaboratorFindFirstOrThrowArgs} args - Arguments to find a Collaborator
     * @example
     * // Get one Collaborator
     * const collaborator = await prisma.collaborator.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CollaboratorFindFirstOrThrowArgs>(args?: SelectSubset<T, CollaboratorFindFirstOrThrowArgs<ExtArgs>>): Prisma__CollaboratorClient<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Collaborators that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollaboratorFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Collaborators
     * const collaborators = await prisma.collaborator.findMany()
     * 
     * // Get first 10 Collaborators
     * const collaborators = await prisma.collaborator.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const collaboratorWithIdOnly = await prisma.collaborator.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CollaboratorFindManyArgs>(args?: SelectSubset<T, CollaboratorFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Collaborator.
     * @param {CollaboratorCreateArgs} args - Arguments to create a Collaborator.
     * @example
     * // Create one Collaborator
     * const Collaborator = await prisma.collaborator.create({
     *   data: {
     *     // ... data to create a Collaborator
     *   }
     * })
     * 
     */
    create<T extends CollaboratorCreateArgs>(args: SelectSubset<T, CollaboratorCreateArgs<ExtArgs>>): Prisma__CollaboratorClient<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Collaborators.
     * @param {CollaboratorCreateManyArgs} args - Arguments to create many Collaborators.
     * @example
     * // Create many Collaborators
     * const collaborator = await prisma.collaborator.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CollaboratorCreateManyArgs>(args?: SelectSubset<T, CollaboratorCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Collaborators and returns the data saved in the database.
     * @param {CollaboratorCreateManyAndReturnArgs} args - Arguments to create many Collaborators.
     * @example
     * // Create many Collaborators
     * const collaborator = await prisma.collaborator.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Collaborators and only return the `id`
     * const collaboratorWithIdOnly = await prisma.collaborator.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CollaboratorCreateManyAndReturnArgs>(args?: SelectSubset<T, CollaboratorCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Collaborator.
     * @param {CollaboratorDeleteArgs} args - Arguments to delete one Collaborator.
     * @example
     * // Delete one Collaborator
     * const Collaborator = await prisma.collaborator.delete({
     *   where: {
     *     // ... filter to delete one Collaborator
     *   }
     * })
     * 
     */
    delete<T extends CollaboratorDeleteArgs>(args: SelectSubset<T, CollaboratorDeleteArgs<ExtArgs>>): Prisma__CollaboratorClient<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Collaborator.
     * @param {CollaboratorUpdateArgs} args - Arguments to update one Collaborator.
     * @example
     * // Update one Collaborator
     * const collaborator = await prisma.collaborator.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CollaboratorUpdateArgs>(args: SelectSubset<T, CollaboratorUpdateArgs<ExtArgs>>): Prisma__CollaboratorClient<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Collaborators.
     * @param {CollaboratorDeleteManyArgs} args - Arguments to filter Collaborators to delete.
     * @example
     * // Delete a few Collaborators
     * const { count } = await prisma.collaborator.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CollaboratorDeleteManyArgs>(args?: SelectSubset<T, CollaboratorDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Collaborators.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollaboratorUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Collaborators
     * const collaborator = await prisma.collaborator.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CollaboratorUpdateManyArgs>(args: SelectSubset<T, CollaboratorUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Collaborator.
     * @param {CollaboratorUpsertArgs} args - Arguments to update or create a Collaborator.
     * @example
     * // Update or create a Collaborator
     * const collaborator = await prisma.collaborator.upsert({
     *   create: {
     *     // ... data to create a Collaborator
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Collaborator we want to update
     *   }
     * })
     */
    upsert<T extends CollaboratorUpsertArgs>(args: SelectSubset<T, CollaboratorUpsertArgs<ExtArgs>>): Prisma__CollaboratorClient<$Result.GetResult<Prisma.$CollaboratorPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Collaborators.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollaboratorCountArgs} args - Arguments to filter Collaborators to count.
     * @example
     * // Count the number of Collaborators
     * const count = await prisma.collaborator.count({
     *   where: {
     *     // ... the filter for the Collaborators we want to count
     *   }
     * })
    **/
    count<T extends CollaboratorCountArgs>(
      args?: Subset<T, CollaboratorCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CollaboratorCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Collaborator.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollaboratorAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CollaboratorAggregateArgs>(args: Subset<T, CollaboratorAggregateArgs>): Prisma.PrismaPromise<GetCollaboratorAggregateType<T>>

    /**
     * Group by Collaborator.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CollaboratorGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CollaboratorGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CollaboratorGroupByArgs['orderBy'] }
        : { orderBy?: CollaboratorGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CollaboratorGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCollaboratorGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Collaborator model
   */
  readonly fields: CollaboratorFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Collaborator.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CollaboratorClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    server<T extends ServerDefaultArgs<ExtArgs> = {}>(args?: Subset<T, ServerDefaultArgs<ExtArgs>>): Prisma__ServerClient<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Collaborator model
   */ 
  interface CollaboratorFieldRefs {
    readonly id: FieldRef<"Collaborator", 'String'>
    readonly serverId: FieldRef<"Collaborator", 'String'>
    readonly userId: FieldRef<"Collaborator", 'String'>
    readonly role: FieldRef<"Collaborator", 'String'>
    readonly createdAt: FieldRef<"Collaborator", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Collaborator findUnique
   */
  export type CollaboratorFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
    /**
     * Filter, which Collaborator to fetch.
     */
    where: CollaboratorWhereUniqueInput
  }

  /**
   * Collaborator findUniqueOrThrow
   */
  export type CollaboratorFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
    /**
     * Filter, which Collaborator to fetch.
     */
    where: CollaboratorWhereUniqueInput
  }

  /**
   * Collaborator findFirst
   */
  export type CollaboratorFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
    /**
     * Filter, which Collaborator to fetch.
     */
    where?: CollaboratorWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Collaborators to fetch.
     */
    orderBy?: CollaboratorOrderByWithRelationInput | CollaboratorOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Collaborators.
     */
    cursor?: CollaboratorWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Collaborators from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Collaborators.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Collaborators.
     */
    distinct?: CollaboratorScalarFieldEnum | CollaboratorScalarFieldEnum[]
  }

  /**
   * Collaborator findFirstOrThrow
   */
  export type CollaboratorFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
    /**
     * Filter, which Collaborator to fetch.
     */
    where?: CollaboratorWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Collaborators to fetch.
     */
    orderBy?: CollaboratorOrderByWithRelationInput | CollaboratorOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Collaborators.
     */
    cursor?: CollaboratorWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Collaborators from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Collaborators.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Collaborators.
     */
    distinct?: CollaboratorScalarFieldEnum | CollaboratorScalarFieldEnum[]
  }

  /**
   * Collaborator findMany
   */
  export type CollaboratorFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
    /**
     * Filter, which Collaborators to fetch.
     */
    where?: CollaboratorWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Collaborators to fetch.
     */
    orderBy?: CollaboratorOrderByWithRelationInput | CollaboratorOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Collaborators.
     */
    cursor?: CollaboratorWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Collaborators from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Collaborators.
     */
    skip?: number
    distinct?: CollaboratorScalarFieldEnum | CollaboratorScalarFieldEnum[]
  }

  /**
   * Collaborator create
   */
  export type CollaboratorCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
    /**
     * The data needed to create a Collaborator.
     */
    data: XOR<CollaboratorCreateInput, CollaboratorUncheckedCreateInput>
  }

  /**
   * Collaborator createMany
   */
  export type CollaboratorCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Collaborators.
     */
    data: CollaboratorCreateManyInput | CollaboratorCreateManyInput[]
  }

  /**
   * Collaborator createManyAndReturn
   */
  export type CollaboratorCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Collaborators.
     */
    data: CollaboratorCreateManyInput | CollaboratorCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Collaborator update
   */
  export type CollaboratorUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
    /**
     * The data needed to update a Collaborator.
     */
    data: XOR<CollaboratorUpdateInput, CollaboratorUncheckedUpdateInput>
    /**
     * Choose, which Collaborator to update.
     */
    where: CollaboratorWhereUniqueInput
  }

  /**
   * Collaborator updateMany
   */
  export type CollaboratorUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Collaborators.
     */
    data: XOR<CollaboratorUpdateManyMutationInput, CollaboratorUncheckedUpdateManyInput>
    /**
     * Filter which Collaborators to update
     */
    where?: CollaboratorWhereInput
  }

  /**
   * Collaborator upsert
   */
  export type CollaboratorUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
    /**
     * The filter to search for the Collaborator to update in case it exists.
     */
    where: CollaboratorWhereUniqueInput
    /**
     * In case the Collaborator found by the `where` argument doesn't exist, create a new Collaborator with this data.
     */
    create: XOR<CollaboratorCreateInput, CollaboratorUncheckedCreateInput>
    /**
     * In case the Collaborator was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CollaboratorUpdateInput, CollaboratorUncheckedUpdateInput>
  }

  /**
   * Collaborator delete
   */
  export type CollaboratorDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
    /**
     * Filter which Collaborator to delete.
     */
    where: CollaboratorWhereUniqueInput
  }

  /**
   * Collaborator deleteMany
   */
  export type CollaboratorDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Collaborators to delete
     */
    where?: CollaboratorWhereInput
  }

  /**
   * Collaborator without action
   */
  export type CollaboratorDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Collaborator
     */
    select?: CollaboratorSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CollaboratorInclude<ExtArgs> | null
  }


  /**
   * Model GameDefinition
   */

  export type AggregateGameDefinition = {
    _count: GameDefinitionCountAggregateOutputType | null
    _avg: GameDefinitionAvgAggregateOutputType | null
    _sum: GameDefinitionSumAggregateOutputType | null
    _min: GameDefinitionMinAggregateOutputType | null
    _max: GameDefinitionMaxAggregateOutputType | null
  }

  export type GameDefinitionAvgAggregateOutputType = {
    recommendedRamGB: number | null
    requiredDiskGB: number | null
  }

  export type GameDefinitionSumAggregateOutputType = {
    recommendedRamGB: number | null
    requiredDiskGB: number | null
  }

  export type GameDefinitionMinAggregateOutputType = {
    id: string | null
    slug: string | null
    displayName: string | null
    icon: string | null
    color: string | null
    description: string | null
    recommendedRamGB: number | null
    requiredDiskGB: number | null
    ownerId: string | null
    isBuiltIn: boolean | null
    installMethod: string | null
    spec: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type GameDefinitionMaxAggregateOutputType = {
    id: string | null
    slug: string | null
    displayName: string | null
    icon: string | null
    color: string | null
    description: string | null
    recommendedRamGB: number | null
    requiredDiskGB: number | null
    ownerId: string | null
    isBuiltIn: boolean | null
    installMethod: string | null
    spec: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type GameDefinitionCountAggregateOutputType = {
    id: number
    slug: number
    displayName: number
    icon: number
    color: number
    description: number
    recommendedRamGB: number
    requiredDiskGB: number
    ownerId: number
    isBuiltIn: number
    installMethod: number
    spec: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type GameDefinitionAvgAggregateInputType = {
    recommendedRamGB?: true
    requiredDiskGB?: true
  }

  export type GameDefinitionSumAggregateInputType = {
    recommendedRamGB?: true
    requiredDiskGB?: true
  }

  export type GameDefinitionMinAggregateInputType = {
    id?: true
    slug?: true
    displayName?: true
    icon?: true
    color?: true
    description?: true
    recommendedRamGB?: true
    requiredDiskGB?: true
    ownerId?: true
    isBuiltIn?: true
    installMethod?: true
    spec?: true
    createdAt?: true
    updatedAt?: true
  }

  export type GameDefinitionMaxAggregateInputType = {
    id?: true
    slug?: true
    displayName?: true
    icon?: true
    color?: true
    description?: true
    recommendedRamGB?: true
    requiredDiskGB?: true
    ownerId?: true
    isBuiltIn?: true
    installMethod?: true
    spec?: true
    createdAt?: true
    updatedAt?: true
  }

  export type GameDefinitionCountAggregateInputType = {
    id?: true
    slug?: true
    displayName?: true
    icon?: true
    color?: true
    description?: true
    recommendedRamGB?: true
    requiredDiskGB?: true
    ownerId?: true
    isBuiltIn?: true
    installMethod?: true
    spec?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type GameDefinitionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which GameDefinition to aggregate.
     */
    where?: GameDefinitionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GameDefinitions to fetch.
     */
    orderBy?: GameDefinitionOrderByWithRelationInput | GameDefinitionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: GameDefinitionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GameDefinitions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GameDefinitions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned GameDefinitions
    **/
    _count?: true | GameDefinitionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: GameDefinitionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: GameDefinitionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: GameDefinitionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: GameDefinitionMaxAggregateInputType
  }

  export type GetGameDefinitionAggregateType<T extends GameDefinitionAggregateArgs> = {
        [P in keyof T & keyof AggregateGameDefinition]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateGameDefinition[P]>
      : GetScalarType<T[P], AggregateGameDefinition[P]>
  }




  export type GameDefinitionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: GameDefinitionWhereInput
    orderBy?: GameDefinitionOrderByWithAggregationInput | GameDefinitionOrderByWithAggregationInput[]
    by: GameDefinitionScalarFieldEnum[] | GameDefinitionScalarFieldEnum
    having?: GameDefinitionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: GameDefinitionCountAggregateInputType | true
    _avg?: GameDefinitionAvgAggregateInputType
    _sum?: GameDefinitionSumAggregateInputType
    _min?: GameDefinitionMinAggregateInputType
    _max?: GameDefinitionMaxAggregateInputType
  }

  export type GameDefinitionGroupByOutputType = {
    id: string
    slug: string
    displayName: string
    icon: string
    color: string
    description: string
    recommendedRamGB: number
    requiredDiskGB: number
    ownerId: string | null
    isBuiltIn: boolean
    installMethod: string
    spec: string
    createdAt: Date
    updatedAt: Date
    _count: GameDefinitionCountAggregateOutputType | null
    _avg: GameDefinitionAvgAggregateOutputType | null
    _sum: GameDefinitionSumAggregateOutputType | null
    _min: GameDefinitionMinAggregateOutputType | null
    _max: GameDefinitionMaxAggregateOutputType | null
  }

  type GetGameDefinitionGroupByPayload<T extends GameDefinitionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<GameDefinitionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof GameDefinitionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], GameDefinitionGroupByOutputType[P]>
            : GetScalarType<T[P], GameDefinitionGroupByOutputType[P]>
        }
      >
    >


  export type GameDefinitionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    slug?: boolean
    displayName?: boolean
    icon?: boolean
    color?: boolean
    description?: boolean
    recommendedRamGB?: boolean
    requiredDiskGB?: boolean
    ownerId?: boolean
    isBuiltIn?: boolean
    installMethod?: boolean
    spec?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    owner?: boolean | GameDefinition$ownerArgs<ExtArgs>
    servers?: boolean | GameDefinition$serversArgs<ExtArgs>
    _count?: boolean | GameDefinitionCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["gameDefinition"]>

  export type GameDefinitionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    slug?: boolean
    displayName?: boolean
    icon?: boolean
    color?: boolean
    description?: boolean
    recommendedRamGB?: boolean
    requiredDiskGB?: boolean
    ownerId?: boolean
    isBuiltIn?: boolean
    installMethod?: boolean
    spec?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    owner?: boolean | GameDefinition$ownerArgs<ExtArgs>
  }, ExtArgs["result"]["gameDefinition"]>

  export type GameDefinitionSelectScalar = {
    id?: boolean
    slug?: boolean
    displayName?: boolean
    icon?: boolean
    color?: boolean
    description?: boolean
    recommendedRamGB?: boolean
    requiredDiskGB?: boolean
    ownerId?: boolean
    isBuiltIn?: boolean
    installMethod?: boolean
    spec?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type GameDefinitionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    owner?: boolean | GameDefinition$ownerArgs<ExtArgs>
    servers?: boolean | GameDefinition$serversArgs<ExtArgs>
    _count?: boolean | GameDefinitionCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type GameDefinitionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    owner?: boolean | GameDefinition$ownerArgs<ExtArgs>
  }

  export type $GameDefinitionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "GameDefinition"
    objects: {
      owner: Prisma.$UserPayload<ExtArgs> | null
      servers: Prisma.$ServerPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      slug: string
      displayName: string
      icon: string
      color: string
      description: string
      recommendedRamGB: number
      requiredDiskGB: number
      ownerId: string | null
      isBuiltIn: boolean
      installMethod: string
      spec: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["gameDefinition"]>
    composites: {}
  }

  type GameDefinitionGetPayload<S extends boolean | null | undefined | GameDefinitionDefaultArgs> = $Result.GetResult<Prisma.$GameDefinitionPayload, S>

  type GameDefinitionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<GameDefinitionFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: GameDefinitionCountAggregateInputType | true
    }

  export interface GameDefinitionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['GameDefinition'], meta: { name: 'GameDefinition' } }
    /**
     * Find zero or one GameDefinition that matches the filter.
     * @param {GameDefinitionFindUniqueArgs} args - Arguments to find a GameDefinition
     * @example
     * // Get one GameDefinition
     * const gameDefinition = await prisma.gameDefinition.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends GameDefinitionFindUniqueArgs>(args: SelectSubset<T, GameDefinitionFindUniqueArgs<ExtArgs>>): Prisma__GameDefinitionClient<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one GameDefinition that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {GameDefinitionFindUniqueOrThrowArgs} args - Arguments to find a GameDefinition
     * @example
     * // Get one GameDefinition
     * const gameDefinition = await prisma.gameDefinition.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends GameDefinitionFindUniqueOrThrowArgs>(args: SelectSubset<T, GameDefinitionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__GameDefinitionClient<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first GameDefinition that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameDefinitionFindFirstArgs} args - Arguments to find a GameDefinition
     * @example
     * // Get one GameDefinition
     * const gameDefinition = await prisma.gameDefinition.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends GameDefinitionFindFirstArgs>(args?: SelectSubset<T, GameDefinitionFindFirstArgs<ExtArgs>>): Prisma__GameDefinitionClient<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first GameDefinition that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameDefinitionFindFirstOrThrowArgs} args - Arguments to find a GameDefinition
     * @example
     * // Get one GameDefinition
     * const gameDefinition = await prisma.gameDefinition.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends GameDefinitionFindFirstOrThrowArgs>(args?: SelectSubset<T, GameDefinitionFindFirstOrThrowArgs<ExtArgs>>): Prisma__GameDefinitionClient<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more GameDefinitions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameDefinitionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all GameDefinitions
     * const gameDefinitions = await prisma.gameDefinition.findMany()
     * 
     * // Get first 10 GameDefinitions
     * const gameDefinitions = await prisma.gameDefinition.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const gameDefinitionWithIdOnly = await prisma.gameDefinition.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends GameDefinitionFindManyArgs>(args?: SelectSubset<T, GameDefinitionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a GameDefinition.
     * @param {GameDefinitionCreateArgs} args - Arguments to create a GameDefinition.
     * @example
     * // Create one GameDefinition
     * const GameDefinition = await prisma.gameDefinition.create({
     *   data: {
     *     // ... data to create a GameDefinition
     *   }
     * })
     * 
     */
    create<T extends GameDefinitionCreateArgs>(args: SelectSubset<T, GameDefinitionCreateArgs<ExtArgs>>): Prisma__GameDefinitionClient<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many GameDefinitions.
     * @param {GameDefinitionCreateManyArgs} args - Arguments to create many GameDefinitions.
     * @example
     * // Create many GameDefinitions
     * const gameDefinition = await prisma.gameDefinition.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends GameDefinitionCreateManyArgs>(args?: SelectSubset<T, GameDefinitionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many GameDefinitions and returns the data saved in the database.
     * @param {GameDefinitionCreateManyAndReturnArgs} args - Arguments to create many GameDefinitions.
     * @example
     * // Create many GameDefinitions
     * const gameDefinition = await prisma.gameDefinition.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many GameDefinitions and only return the `id`
     * const gameDefinitionWithIdOnly = await prisma.gameDefinition.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends GameDefinitionCreateManyAndReturnArgs>(args?: SelectSubset<T, GameDefinitionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a GameDefinition.
     * @param {GameDefinitionDeleteArgs} args - Arguments to delete one GameDefinition.
     * @example
     * // Delete one GameDefinition
     * const GameDefinition = await prisma.gameDefinition.delete({
     *   where: {
     *     // ... filter to delete one GameDefinition
     *   }
     * })
     * 
     */
    delete<T extends GameDefinitionDeleteArgs>(args: SelectSubset<T, GameDefinitionDeleteArgs<ExtArgs>>): Prisma__GameDefinitionClient<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one GameDefinition.
     * @param {GameDefinitionUpdateArgs} args - Arguments to update one GameDefinition.
     * @example
     * // Update one GameDefinition
     * const gameDefinition = await prisma.gameDefinition.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends GameDefinitionUpdateArgs>(args: SelectSubset<T, GameDefinitionUpdateArgs<ExtArgs>>): Prisma__GameDefinitionClient<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more GameDefinitions.
     * @param {GameDefinitionDeleteManyArgs} args - Arguments to filter GameDefinitions to delete.
     * @example
     * // Delete a few GameDefinitions
     * const { count } = await prisma.gameDefinition.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends GameDefinitionDeleteManyArgs>(args?: SelectSubset<T, GameDefinitionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more GameDefinitions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameDefinitionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many GameDefinitions
     * const gameDefinition = await prisma.gameDefinition.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends GameDefinitionUpdateManyArgs>(args: SelectSubset<T, GameDefinitionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one GameDefinition.
     * @param {GameDefinitionUpsertArgs} args - Arguments to update or create a GameDefinition.
     * @example
     * // Update or create a GameDefinition
     * const gameDefinition = await prisma.gameDefinition.upsert({
     *   create: {
     *     // ... data to create a GameDefinition
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the GameDefinition we want to update
     *   }
     * })
     */
    upsert<T extends GameDefinitionUpsertArgs>(args: SelectSubset<T, GameDefinitionUpsertArgs<ExtArgs>>): Prisma__GameDefinitionClient<$Result.GetResult<Prisma.$GameDefinitionPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of GameDefinitions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameDefinitionCountArgs} args - Arguments to filter GameDefinitions to count.
     * @example
     * // Count the number of GameDefinitions
     * const count = await prisma.gameDefinition.count({
     *   where: {
     *     // ... the filter for the GameDefinitions we want to count
     *   }
     * })
    **/
    count<T extends GameDefinitionCountArgs>(
      args?: Subset<T, GameDefinitionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], GameDefinitionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a GameDefinition.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameDefinitionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends GameDefinitionAggregateArgs>(args: Subset<T, GameDefinitionAggregateArgs>): Prisma.PrismaPromise<GetGameDefinitionAggregateType<T>>

    /**
     * Group by GameDefinition.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GameDefinitionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends GameDefinitionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: GameDefinitionGroupByArgs['orderBy'] }
        : { orderBy?: GameDefinitionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, GameDefinitionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetGameDefinitionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the GameDefinition model
   */
  readonly fields: GameDefinitionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for GameDefinition.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__GameDefinitionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    owner<T extends GameDefinition$ownerArgs<ExtArgs> = {}>(args?: Subset<T, GameDefinition$ownerArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    servers<T extends GameDefinition$serversArgs<ExtArgs> = {}>(args?: Subset<T, GameDefinition$serversArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ServerPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the GameDefinition model
   */ 
  interface GameDefinitionFieldRefs {
    readonly id: FieldRef<"GameDefinition", 'String'>
    readonly slug: FieldRef<"GameDefinition", 'String'>
    readonly displayName: FieldRef<"GameDefinition", 'String'>
    readonly icon: FieldRef<"GameDefinition", 'String'>
    readonly color: FieldRef<"GameDefinition", 'String'>
    readonly description: FieldRef<"GameDefinition", 'String'>
    readonly recommendedRamGB: FieldRef<"GameDefinition", 'Float'>
    readonly requiredDiskGB: FieldRef<"GameDefinition", 'Float'>
    readonly ownerId: FieldRef<"GameDefinition", 'String'>
    readonly isBuiltIn: FieldRef<"GameDefinition", 'Boolean'>
    readonly installMethod: FieldRef<"GameDefinition", 'String'>
    readonly spec: FieldRef<"GameDefinition", 'String'>
    readonly createdAt: FieldRef<"GameDefinition", 'DateTime'>
    readonly updatedAt: FieldRef<"GameDefinition", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * GameDefinition findUnique
   */
  export type GameDefinitionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
    /**
     * Filter, which GameDefinition to fetch.
     */
    where: GameDefinitionWhereUniqueInput
  }

  /**
   * GameDefinition findUniqueOrThrow
   */
  export type GameDefinitionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
    /**
     * Filter, which GameDefinition to fetch.
     */
    where: GameDefinitionWhereUniqueInput
  }

  /**
   * GameDefinition findFirst
   */
  export type GameDefinitionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
    /**
     * Filter, which GameDefinition to fetch.
     */
    where?: GameDefinitionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GameDefinitions to fetch.
     */
    orderBy?: GameDefinitionOrderByWithRelationInput | GameDefinitionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for GameDefinitions.
     */
    cursor?: GameDefinitionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GameDefinitions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GameDefinitions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of GameDefinitions.
     */
    distinct?: GameDefinitionScalarFieldEnum | GameDefinitionScalarFieldEnum[]
  }

  /**
   * GameDefinition findFirstOrThrow
   */
  export type GameDefinitionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
    /**
     * Filter, which GameDefinition to fetch.
     */
    where?: GameDefinitionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GameDefinitions to fetch.
     */
    orderBy?: GameDefinitionOrderByWithRelationInput | GameDefinitionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for GameDefinitions.
     */
    cursor?: GameDefinitionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GameDefinitions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GameDefinitions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of GameDefinitions.
     */
    distinct?: GameDefinitionScalarFieldEnum | GameDefinitionScalarFieldEnum[]
  }

  /**
   * GameDefinition findMany
   */
  export type GameDefinitionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
    /**
     * Filter, which GameDefinitions to fetch.
     */
    where?: GameDefinitionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of GameDefinitions to fetch.
     */
    orderBy?: GameDefinitionOrderByWithRelationInput | GameDefinitionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing GameDefinitions.
     */
    cursor?: GameDefinitionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` GameDefinitions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` GameDefinitions.
     */
    skip?: number
    distinct?: GameDefinitionScalarFieldEnum | GameDefinitionScalarFieldEnum[]
  }

  /**
   * GameDefinition create
   */
  export type GameDefinitionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
    /**
     * The data needed to create a GameDefinition.
     */
    data: XOR<GameDefinitionCreateInput, GameDefinitionUncheckedCreateInput>
  }

  /**
   * GameDefinition createMany
   */
  export type GameDefinitionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many GameDefinitions.
     */
    data: GameDefinitionCreateManyInput | GameDefinitionCreateManyInput[]
  }

  /**
   * GameDefinition createManyAndReturn
   */
  export type GameDefinitionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many GameDefinitions.
     */
    data: GameDefinitionCreateManyInput | GameDefinitionCreateManyInput[]
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * GameDefinition update
   */
  export type GameDefinitionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
    /**
     * The data needed to update a GameDefinition.
     */
    data: XOR<GameDefinitionUpdateInput, GameDefinitionUncheckedUpdateInput>
    /**
     * Choose, which GameDefinition to update.
     */
    where: GameDefinitionWhereUniqueInput
  }

  /**
   * GameDefinition updateMany
   */
  export type GameDefinitionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update GameDefinitions.
     */
    data: XOR<GameDefinitionUpdateManyMutationInput, GameDefinitionUncheckedUpdateManyInput>
    /**
     * Filter which GameDefinitions to update
     */
    where?: GameDefinitionWhereInput
  }

  /**
   * GameDefinition upsert
   */
  export type GameDefinitionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
    /**
     * The filter to search for the GameDefinition to update in case it exists.
     */
    where: GameDefinitionWhereUniqueInput
    /**
     * In case the GameDefinition found by the `where` argument doesn't exist, create a new GameDefinition with this data.
     */
    create: XOR<GameDefinitionCreateInput, GameDefinitionUncheckedCreateInput>
    /**
     * In case the GameDefinition was found with the provided `where` argument, update it with this data.
     */
    update: XOR<GameDefinitionUpdateInput, GameDefinitionUncheckedUpdateInput>
  }

  /**
   * GameDefinition delete
   */
  export type GameDefinitionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
    /**
     * Filter which GameDefinition to delete.
     */
    where: GameDefinitionWhereUniqueInput
  }

  /**
   * GameDefinition deleteMany
   */
  export type GameDefinitionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which GameDefinitions to delete
     */
    where?: GameDefinitionWhereInput
  }

  /**
   * GameDefinition.owner
   */
  export type GameDefinition$ownerArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    where?: UserWhereInput
  }

  /**
   * GameDefinition.servers
   */
  export type GameDefinition$serversArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Server
     */
    select?: ServerSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ServerInclude<ExtArgs> | null
    where?: ServerWhereInput
    orderBy?: ServerOrderByWithRelationInput | ServerOrderByWithRelationInput[]
    cursor?: ServerWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ServerScalarFieldEnum | ServerScalarFieldEnum[]
  }

  /**
   * GameDefinition without action
   */
  export type GameDefinitionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GameDefinition
     */
    select?: GameDefinitionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GameDefinitionInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const UserScalarFieldEnum: {
    id: 'id',
    email: 'email',
    passwordHash: 'passwordHash',
    name: 'name',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    role: 'role'
  };

  export type UserScalarFieldEnum = (typeof UserScalarFieldEnum)[keyof typeof UserScalarFieldEnum]


  export const SubscriptionScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    plan: 'plan',
    status: 'status',
    activeSlots: 'activeSlots',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type SubscriptionScalarFieldEnum = (typeof SubscriptionScalarFieldEnum)[keyof typeof SubscriptionScalarFieldEnum]


  export const ServerScalarFieldEnum: {
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
    cpuUsage: 'cpuUsage',
    memoryUsage: 'memoryUsage',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    snapshotInterval: 'snapshotInterval',
    lastSnapshotAt: 'lastSnapshotAt'
  };

  export type ServerScalarFieldEnum = (typeof ServerScalarFieldEnum)[keyof typeof ServerScalarFieldEnum]


  export const ArchiveScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    serverName: 'serverName',
    game: 'game',
    saveSizeGB: 'saveSizeGB',
    archivedAt: 'archivedAt',
    createdAt: 'createdAt'
  };

  export type ArchiveScalarFieldEnum = (typeof ArchiveScalarFieldEnum)[keyof typeof ArchiveScalarFieldEnum]


  export const ActivityLogScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    action: 'action',
    details: 'details',
    createdAt: 'createdAt'
  };

  export type ActivityLogScalarFieldEnum = (typeof ActivityLogScalarFieldEnum)[keyof typeof ActivityLogScalarFieldEnum]


  export const BackupScalarFieldEnum: {
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

  export type BackupScalarFieldEnum = (typeof BackupScalarFieldEnum)[keyof typeof BackupScalarFieldEnum]


  export const CollaboratorScalarFieldEnum: {
    id: 'id',
    serverId: 'serverId',
    userId: 'userId',
    role: 'role',
    createdAt: 'createdAt'
  };

  export type CollaboratorScalarFieldEnum = (typeof CollaboratorScalarFieldEnum)[keyof typeof CollaboratorScalarFieldEnum]


  export const GameDefinitionScalarFieldEnum: {
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

  export type GameDefinitionScalarFieldEnum = (typeof GameDefinitionScalarFieldEnum)[keyof typeof GameDefinitionScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    
  /**
   * Deep Input Types
   */


  export type UserWhereInput = {
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    id?: StringFilter<"User"> | string
    email?: StringFilter<"User"> | string
    passwordHash?: StringFilter<"User"> | string
    name?: StringFilter<"User"> | string
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
    role?: StringFilter<"User"> | string
    definitions?: GameDefinitionListRelationFilter
    subscription?: XOR<SubscriptionNullableRelationFilter, SubscriptionWhereInput> | null
    servers?: ServerListRelationFilter
    archives?: ArchiveListRelationFilter
    logs?: ActivityLogListRelationFilter
    collaboratorAccess?: CollaboratorListRelationFilter
  }

  export type UserOrderByWithRelationInput = {
    id?: SortOrder
    email?: SortOrder
    passwordHash?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    role?: SortOrder
    definitions?: GameDefinitionOrderByRelationAggregateInput
    subscription?: SubscriptionOrderByWithRelationInput
    servers?: ServerOrderByRelationAggregateInput
    archives?: ArchiveOrderByRelationAggregateInput
    logs?: ActivityLogOrderByRelationAggregateInput
    collaboratorAccess?: CollaboratorOrderByRelationAggregateInput
  }

  export type UserWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    email?: string
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    passwordHash?: StringFilter<"User"> | string
    name?: StringFilter<"User"> | string
    createdAt?: DateTimeFilter<"User"> | Date | string
    updatedAt?: DateTimeFilter<"User"> | Date | string
    role?: StringFilter<"User"> | string
    definitions?: GameDefinitionListRelationFilter
    subscription?: XOR<SubscriptionNullableRelationFilter, SubscriptionWhereInput> | null
    servers?: ServerListRelationFilter
    archives?: ArchiveListRelationFilter
    logs?: ActivityLogListRelationFilter
    collaboratorAccess?: CollaboratorListRelationFilter
  }, "id" | "email">

  export type UserOrderByWithAggregationInput = {
    id?: SortOrder
    email?: SortOrder
    passwordHash?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    role?: SortOrder
    _count?: UserCountOrderByAggregateInput
    _max?: UserMaxOrderByAggregateInput
    _min?: UserMinOrderByAggregateInput
  }

  export type UserScalarWhereWithAggregatesInput = {
    AND?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    OR?: UserScalarWhereWithAggregatesInput[]
    NOT?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"User"> | string
    email?: StringWithAggregatesFilter<"User"> | string
    passwordHash?: StringWithAggregatesFilter<"User"> | string
    name?: StringWithAggregatesFilter<"User"> | string
    createdAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"User"> | Date | string
    role?: StringWithAggregatesFilter<"User"> | string
  }

  export type SubscriptionWhereInput = {
    AND?: SubscriptionWhereInput | SubscriptionWhereInput[]
    OR?: SubscriptionWhereInput[]
    NOT?: SubscriptionWhereInput | SubscriptionWhereInput[]
    id?: StringFilter<"Subscription"> | string
    userId?: StringFilter<"Subscription"> | string
    plan?: StringFilter<"Subscription"> | string
    status?: StringFilter<"Subscription"> | string
    activeSlots?: IntFilter<"Subscription"> | number
    createdAt?: DateTimeFilter<"Subscription"> | Date | string
    updatedAt?: DateTimeFilter<"Subscription"> | Date | string
    user?: XOR<UserRelationFilter, UserWhereInput>
  }

  export type SubscriptionOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    plan?: SortOrder
    status?: SortOrder
    activeSlots?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    user?: UserOrderByWithRelationInput
  }

  export type SubscriptionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    userId?: string
    AND?: SubscriptionWhereInput | SubscriptionWhereInput[]
    OR?: SubscriptionWhereInput[]
    NOT?: SubscriptionWhereInput | SubscriptionWhereInput[]
    plan?: StringFilter<"Subscription"> | string
    status?: StringFilter<"Subscription"> | string
    activeSlots?: IntFilter<"Subscription"> | number
    createdAt?: DateTimeFilter<"Subscription"> | Date | string
    updatedAt?: DateTimeFilter<"Subscription"> | Date | string
    user?: XOR<UserRelationFilter, UserWhereInput>
  }, "id" | "userId">

  export type SubscriptionOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    plan?: SortOrder
    status?: SortOrder
    activeSlots?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: SubscriptionCountOrderByAggregateInput
    _avg?: SubscriptionAvgOrderByAggregateInput
    _max?: SubscriptionMaxOrderByAggregateInput
    _min?: SubscriptionMinOrderByAggregateInput
    _sum?: SubscriptionSumOrderByAggregateInput
  }

  export type SubscriptionScalarWhereWithAggregatesInput = {
    AND?: SubscriptionScalarWhereWithAggregatesInput | SubscriptionScalarWhereWithAggregatesInput[]
    OR?: SubscriptionScalarWhereWithAggregatesInput[]
    NOT?: SubscriptionScalarWhereWithAggregatesInput | SubscriptionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Subscription"> | string
    userId?: StringWithAggregatesFilter<"Subscription"> | string
    plan?: StringWithAggregatesFilter<"Subscription"> | string
    status?: StringWithAggregatesFilter<"Subscription"> | string
    activeSlots?: IntWithAggregatesFilter<"Subscription"> | number
    createdAt?: DateTimeWithAggregatesFilter<"Subscription"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Subscription"> | Date | string
  }

  export type ServerWhereInput = {
    AND?: ServerWhereInput | ServerWhereInput[]
    OR?: ServerWhereInput[]
    NOT?: ServerWhereInput | ServerWhereInput[]
    id?: StringFilter<"Server"> | string
    userId?: StringFilter<"Server"> | string
    name?: StringFilter<"Server"> | string
    game?: StringFilter<"Server"> | string
    ramAllocation?: FloatFilter<"Server"> | number
    region?: StringFilter<"Server"> | string
    status?: StringFilter<"Server"> | string
    runnerType?: StringFilter<"Server"> | string
    localPath?: StringNullableFilter<"Server"> | string | null
    pid?: IntNullableFilter<"Server"> | number | null
    password?: StringNullableFilter<"Server"> | string | null
    enableUpnp?: BoolFilter<"Server"> | boolean
    ipAddress?: StringFilter<"Server"> | string
    port?: IntFilter<"Server"> | number
    definitionId?: StringNullableFilter<"Server"> | string | null
    paramValues?: StringNullableFilter<"Server"> | string | null
    cpuUsage?: FloatFilter<"Server"> | number
    memoryUsage?: FloatFilter<"Server"> | number
    createdAt?: DateTimeFilter<"Server"> | Date | string
    updatedAt?: DateTimeFilter<"Server"> | Date | string
    snapshotInterval?: IntFilter<"Server"> | number
    lastSnapshotAt?: DateTimeNullableFilter<"Server"> | Date | string | null
    user?: XOR<UserRelationFilter, UserWhereInput>
    definition?: XOR<GameDefinitionNullableRelationFilter, GameDefinitionWhereInput> | null
    backups?: BackupListRelationFilter
    collaborators?: CollaboratorListRelationFilter
  }

  export type ServerOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    game?: SortOrder
    ramAllocation?: SortOrder
    region?: SortOrder
    status?: SortOrder
    runnerType?: SortOrder
    localPath?: SortOrderInput | SortOrder
    pid?: SortOrderInput | SortOrder
    password?: SortOrderInput | SortOrder
    enableUpnp?: SortOrder
    ipAddress?: SortOrder
    port?: SortOrder
    definitionId?: SortOrderInput | SortOrder
    paramValues?: SortOrderInput | SortOrder
    cpuUsage?: SortOrder
    memoryUsage?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    snapshotInterval?: SortOrder
    lastSnapshotAt?: SortOrderInput | SortOrder
    user?: UserOrderByWithRelationInput
    definition?: GameDefinitionOrderByWithRelationInput
    backups?: BackupOrderByRelationAggregateInput
    collaborators?: CollaboratorOrderByRelationAggregateInput
  }

  export type ServerWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ServerWhereInput | ServerWhereInput[]
    OR?: ServerWhereInput[]
    NOT?: ServerWhereInput | ServerWhereInput[]
    userId?: StringFilter<"Server"> | string
    name?: StringFilter<"Server"> | string
    game?: StringFilter<"Server"> | string
    ramAllocation?: FloatFilter<"Server"> | number
    region?: StringFilter<"Server"> | string
    status?: StringFilter<"Server"> | string
    runnerType?: StringFilter<"Server"> | string
    localPath?: StringNullableFilter<"Server"> | string | null
    pid?: IntNullableFilter<"Server"> | number | null
    password?: StringNullableFilter<"Server"> | string | null
    enableUpnp?: BoolFilter<"Server"> | boolean
    ipAddress?: StringFilter<"Server"> | string
    port?: IntFilter<"Server"> | number
    definitionId?: StringNullableFilter<"Server"> | string | null
    paramValues?: StringNullableFilter<"Server"> | string | null
    cpuUsage?: FloatFilter<"Server"> | number
    memoryUsage?: FloatFilter<"Server"> | number
    createdAt?: DateTimeFilter<"Server"> | Date | string
    updatedAt?: DateTimeFilter<"Server"> | Date | string
    snapshotInterval?: IntFilter<"Server"> | number
    lastSnapshotAt?: DateTimeNullableFilter<"Server"> | Date | string | null
    user?: XOR<UserRelationFilter, UserWhereInput>
    definition?: XOR<GameDefinitionNullableRelationFilter, GameDefinitionWhereInput> | null
    backups?: BackupListRelationFilter
    collaborators?: CollaboratorListRelationFilter
  }, "id">

  export type ServerOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    game?: SortOrder
    ramAllocation?: SortOrder
    region?: SortOrder
    status?: SortOrder
    runnerType?: SortOrder
    localPath?: SortOrderInput | SortOrder
    pid?: SortOrderInput | SortOrder
    password?: SortOrderInput | SortOrder
    enableUpnp?: SortOrder
    ipAddress?: SortOrder
    port?: SortOrder
    definitionId?: SortOrderInput | SortOrder
    paramValues?: SortOrderInput | SortOrder
    cpuUsage?: SortOrder
    memoryUsage?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    snapshotInterval?: SortOrder
    lastSnapshotAt?: SortOrderInput | SortOrder
    _count?: ServerCountOrderByAggregateInput
    _avg?: ServerAvgOrderByAggregateInput
    _max?: ServerMaxOrderByAggregateInput
    _min?: ServerMinOrderByAggregateInput
    _sum?: ServerSumOrderByAggregateInput
  }

  export type ServerScalarWhereWithAggregatesInput = {
    AND?: ServerScalarWhereWithAggregatesInput | ServerScalarWhereWithAggregatesInput[]
    OR?: ServerScalarWhereWithAggregatesInput[]
    NOT?: ServerScalarWhereWithAggregatesInput | ServerScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Server"> | string
    userId?: StringWithAggregatesFilter<"Server"> | string
    name?: StringWithAggregatesFilter<"Server"> | string
    game?: StringWithAggregatesFilter<"Server"> | string
    ramAllocation?: FloatWithAggregatesFilter<"Server"> | number
    region?: StringWithAggregatesFilter<"Server"> | string
    status?: StringWithAggregatesFilter<"Server"> | string
    runnerType?: StringWithAggregatesFilter<"Server"> | string
    localPath?: StringNullableWithAggregatesFilter<"Server"> | string | null
    pid?: IntNullableWithAggregatesFilter<"Server"> | number | null
    password?: StringNullableWithAggregatesFilter<"Server"> | string | null
    enableUpnp?: BoolWithAggregatesFilter<"Server"> | boolean
    ipAddress?: StringWithAggregatesFilter<"Server"> | string
    port?: IntWithAggregatesFilter<"Server"> | number
    definitionId?: StringNullableWithAggregatesFilter<"Server"> | string | null
    paramValues?: StringNullableWithAggregatesFilter<"Server"> | string | null
    cpuUsage?: FloatWithAggregatesFilter<"Server"> | number
    memoryUsage?: FloatWithAggregatesFilter<"Server"> | number
    createdAt?: DateTimeWithAggregatesFilter<"Server"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Server"> | Date | string
    snapshotInterval?: IntWithAggregatesFilter<"Server"> | number
    lastSnapshotAt?: DateTimeNullableWithAggregatesFilter<"Server"> | Date | string | null
  }

  export type ArchiveWhereInput = {
    AND?: ArchiveWhereInput | ArchiveWhereInput[]
    OR?: ArchiveWhereInput[]
    NOT?: ArchiveWhereInput | ArchiveWhereInput[]
    id?: StringFilter<"Archive"> | string
    userId?: StringFilter<"Archive"> | string
    serverName?: StringFilter<"Archive"> | string
    game?: StringFilter<"Archive"> | string
    saveSizeGB?: FloatFilter<"Archive"> | number
    archivedAt?: DateTimeFilter<"Archive"> | Date | string
    createdAt?: DateTimeFilter<"Archive"> | Date | string
    user?: XOR<UserRelationFilter, UserWhereInput>
  }

  export type ArchiveOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    serverName?: SortOrder
    game?: SortOrder
    saveSizeGB?: SortOrder
    archivedAt?: SortOrder
    createdAt?: SortOrder
    user?: UserOrderByWithRelationInput
  }

  export type ArchiveWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ArchiveWhereInput | ArchiveWhereInput[]
    OR?: ArchiveWhereInput[]
    NOT?: ArchiveWhereInput | ArchiveWhereInput[]
    userId?: StringFilter<"Archive"> | string
    serverName?: StringFilter<"Archive"> | string
    game?: StringFilter<"Archive"> | string
    saveSizeGB?: FloatFilter<"Archive"> | number
    archivedAt?: DateTimeFilter<"Archive"> | Date | string
    createdAt?: DateTimeFilter<"Archive"> | Date | string
    user?: XOR<UserRelationFilter, UserWhereInput>
  }, "id">

  export type ArchiveOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    serverName?: SortOrder
    game?: SortOrder
    saveSizeGB?: SortOrder
    archivedAt?: SortOrder
    createdAt?: SortOrder
    _count?: ArchiveCountOrderByAggregateInput
    _avg?: ArchiveAvgOrderByAggregateInput
    _max?: ArchiveMaxOrderByAggregateInput
    _min?: ArchiveMinOrderByAggregateInput
    _sum?: ArchiveSumOrderByAggregateInput
  }

  export type ArchiveScalarWhereWithAggregatesInput = {
    AND?: ArchiveScalarWhereWithAggregatesInput | ArchiveScalarWhereWithAggregatesInput[]
    OR?: ArchiveScalarWhereWithAggregatesInput[]
    NOT?: ArchiveScalarWhereWithAggregatesInput | ArchiveScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Archive"> | string
    userId?: StringWithAggregatesFilter<"Archive"> | string
    serverName?: StringWithAggregatesFilter<"Archive"> | string
    game?: StringWithAggregatesFilter<"Archive"> | string
    saveSizeGB?: FloatWithAggregatesFilter<"Archive"> | number
    archivedAt?: DateTimeWithAggregatesFilter<"Archive"> | Date | string
    createdAt?: DateTimeWithAggregatesFilter<"Archive"> | Date | string
  }

  export type ActivityLogWhereInput = {
    AND?: ActivityLogWhereInput | ActivityLogWhereInput[]
    OR?: ActivityLogWhereInput[]
    NOT?: ActivityLogWhereInput | ActivityLogWhereInput[]
    id?: StringFilter<"ActivityLog"> | string
    userId?: StringFilter<"ActivityLog"> | string
    action?: StringFilter<"ActivityLog"> | string
    details?: StringFilter<"ActivityLog"> | string
    createdAt?: DateTimeFilter<"ActivityLog"> | Date | string
    user?: XOR<UserRelationFilter, UserWhereInput>
  }

  export type ActivityLogOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    action?: SortOrder
    details?: SortOrder
    createdAt?: SortOrder
    user?: UserOrderByWithRelationInput
  }

  export type ActivityLogWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ActivityLogWhereInput | ActivityLogWhereInput[]
    OR?: ActivityLogWhereInput[]
    NOT?: ActivityLogWhereInput | ActivityLogWhereInput[]
    userId?: StringFilter<"ActivityLog"> | string
    action?: StringFilter<"ActivityLog"> | string
    details?: StringFilter<"ActivityLog"> | string
    createdAt?: DateTimeFilter<"ActivityLog"> | Date | string
    user?: XOR<UserRelationFilter, UserWhereInput>
  }, "id">

  export type ActivityLogOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    action?: SortOrder
    details?: SortOrder
    createdAt?: SortOrder
    _count?: ActivityLogCountOrderByAggregateInput
    _max?: ActivityLogMaxOrderByAggregateInput
    _min?: ActivityLogMinOrderByAggregateInput
  }

  export type ActivityLogScalarWhereWithAggregatesInput = {
    AND?: ActivityLogScalarWhereWithAggregatesInput | ActivityLogScalarWhereWithAggregatesInput[]
    OR?: ActivityLogScalarWhereWithAggregatesInput[]
    NOT?: ActivityLogScalarWhereWithAggregatesInput | ActivityLogScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"ActivityLog"> | string
    userId?: StringWithAggregatesFilter<"ActivityLog"> | string
    action?: StringWithAggregatesFilter<"ActivityLog"> | string
    details?: StringWithAggregatesFilter<"ActivityLog"> | string
    createdAt?: DateTimeWithAggregatesFilter<"ActivityLog"> | Date | string
  }

  export type BackupWhereInput = {
    AND?: BackupWhereInput | BackupWhereInput[]
    OR?: BackupWhereInput[]
    NOT?: BackupWhereInput | BackupWhereInput[]
    id?: StringFilter<"Backup"> | string
    serverId?: StringFilter<"Backup"> | string
    userId?: StringFilter<"Backup"> | string
    name?: StringFilter<"Backup"> | string
    game?: StringFilter<"Backup"> | string
    filePath?: StringFilter<"Backup"> | string
    fileSizeMB?: FloatFilter<"Backup"> | number
    backupType?: StringFilter<"Backup"> | string
    createdAt?: DateTimeFilter<"Backup"> | Date | string
    server?: XOR<ServerRelationFilter, ServerWhereInput>
  }

  export type BackupOrderByWithRelationInput = {
    id?: SortOrder
    serverId?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    game?: SortOrder
    filePath?: SortOrder
    fileSizeMB?: SortOrder
    backupType?: SortOrder
    createdAt?: SortOrder
    server?: ServerOrderByWithRelationInput
  }

  export type BackupWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: BackupWhereInput | BackupWhereInput[]
    OR?: BackupWhereInput[]
    NOT?: BackupWhereInput | BackupWhereInput[]
    serverId?: StringFilter<"Backup"> | string
    userId?: StringFilter<"Backup"> | string
    name?: StringFilter<"Backup"> | string
    game?: StringFilter<"Backup"> | string
    filePath?: StringFilter<"Backup"> | string
    fileSizeMB?: FloatFilter<"Backup"> | number
    backupType?: StringFilter<"Backup"> | string
    createdAt?: DateTimeFilter<"Backup"> | Date | string
    server?: XOR<ServerRelationFilter, ServerWhereInput>
  }, "id">

  export type BackupOrderByWithAggregationInput = {
    id?: SortOrder
    serverId?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    game?: SortOrder
    filePath?: SortOrder
    fileSizeMB?: SortOrder
    backupType?: SortOrder
    createdAt?: SortOrder
    _count?: BackupCountOrderByAggregateInput
    _avg?: BackupAvgOrderByAggregateInput
    _max?: BackupMaxOrderByAggregateInput
    _min?: BackupMinOrderByAggregateInput
    _sum?: BackupSumOrderByAggregateInput
  }

  export type BackupScalarWhereWithAggregatesInput = {
    AND?: BackupScalarWhereWithAggregatesInput | BackupScalarWhereWithAggregatesInput[]
    OR?: BackupScalarWhereWithAggregatesInput[]
    NOT?: BackupScalarWhereWithAggregatesInput | BackupScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Backup"> | string
    serverId?: StringWithAggregatesFilter<"Backup"> | string
    userId?: StringWithAggregatesFilter<"Backup"> | string
    name?: StringWithAggregatesFilter<"Backup"> | string
    game?: StringWithAggregatesFilter<"Backup"> | string
    filePath?: StringWithAggregatesFilter<"Backup"> | string
    fileSizeMB?: FloatWithAggregatesFilter<"Backup"> | number
    backupType?: StringWithAggregatesFilter<"Backup"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Backup"> | Date | string
  }

  export type CollaboratorWhereInput = {
    AND?: CollaboratorWhereInput | CollaboratorWhereInput[]
    OR?: CollaboratorWhereInput[]
    NOT?: CollaboratorWhereInput | CollaboratorWhereInput[]
    id?: StringFilter<"Collaborator"> | string
    serverId?: StringFilter<"Collaborator"> | string
    userId?: StringFilter<"Collaborator"> | string
    role?: StringFilter<"Collaborator"> | string
    createdAt?: DateTimeFilter<"Collaborator"> | Date | string
    server?: XOR<ServerRelationFilter, ServerWhereInput>
    user?: XOR<UserRelationFilter, UserWhereInput>
  }

  export type CollaboratorOrderByWithRelationInput = {
    id?: SortOrder
    serverId?: SortOrder
    userId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
    server?: ServerOrderByWithRelationInput
    user?: UserOrderByWithRelationInput
  }

  export type CollaboratorWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    serverId_userId?: CollaboratorServerIdUserIdCompoundUniqueInput
    AND?: CollaboratorWhereInput | CollaboratorWhereInput[]
    OR?: CollaboratorWhereInput[]
    NOT?: CollaboratorWhereInput | CollaboratorWhereInput[]
    serverId?: StringFilter<"Collaborator"> | string
    userId?: StringFilter<"Collaborator"> | string
    role?: StringFilter<"Collaborator"> | string
    createdAt?: DateTimeFilter<"Collaborator"> | Date | string
    server?: XOR<ServerRelationFilter, ServerWhereInput>
    user?: XOR<UserRelationFilter, UserWhereInput>
  }, "id" | "serverId_userId">

  export type CollaboratorOrderByWithAggregationInput = {
    id?: SortOrder
    serverId?: SortOrder
    userId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
    _count?: CollaboratorCountOrderByAggregateInput
    _max?: CollaboratorMaxOrderByAggregateInput
    _min?: CollaboratorMinOrderByAggregateInput
  }

  export type CollaboratorScalarWhereWithAggregatesInput = {
    AND?: CollaboratorScalarWhereWithAggregatesInput | CollaboratorScalarWhereWithAggregatesInput[]
    OR?: CollaboratorScalarWhereWithAggregatesInput[]
    NOT?: CollaboratorScalarWhereWithAggregatesInput | CollaboratorScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Collaborator"> | string
    serverId?: StringWithAggregatesFilter<"Collaborator"> | string
    userId?: StringWithAggregatesFilter<"Collaborator"> | string
    role?: StringWithAggregatesFilter<"Collaborator"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Collaborator"> | Date | string
  }

  export type GameDefinitionWhereInput = {
    AND?: GameDefinitionWhereInput | GameDefinitionWhereInput[]
    OR?: GameDefinitionWhereInput[]
    NOT?: GameDefinitionWhereInput | GameDefinitionWhereInput[]
    id?: StringFilter<"GameDefinition"> | string
    slug?: StringFilter<"GameDefinition"> | string
    displayName?: StringFilter<"GameDefinition"> | string
    icon?: StringFilter<"GameDefinition"> | string
    color?: StringFilter<"GameDefinition"> | string
    description?: StringFilter<"GameDefinition"> | string
    recommendedRamGB?: FloatFilter<"GameDefinition"> | number
    requiredDiskGB?: FloatFilter<"GameDefinition"> | number
    ownerId?: StringNullableFilter<"GameDefinition"> | string | null
    isBuiltIn?: BoolFilter<"GameDefinition"> | boolean
    installMethod?: StringFilter<"GameDefinition"> | string
    spec?: StringFilter<"GameDefinition"> | string
    createdAt?: DateTimeFilter<"GameDefinition"> | Date | string
    updatedAt?: DateTimeFilter<"GameDefinition"> | Date | string
    owner?: XOR<UserNullableRelationFilter, UserWhereInput> | null
    servers?: ServerListRelationFilter
  }

  export type GameDefinitionOrderByWithRelationInput = {
    id?: SortOrder
    slug?: SortOrder
    displayName?: SortOrder
    icon?: SortOrder
    color?: SortOrder
    description?: SortOrder
    recommendedRamGB?: SortOrder
    requiredDiskGB?: SortOrder
    ownerId?: SortOrderInput | SortOrder
    isBuiltIn?: SortOrder
    installMethod?: SortOrder
    spec?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    owner?: UserOrderByWithRelationInput
    servers?: ServerOrderByRelationAggregateInput
  }

  export type GameDefinitionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    ownerId_slug?: GameDefinitionOwnerIdSlugCompoundUniqueInput
    AND?: GameDefinitionWhereInput | GameDefinitionWhereInput[]
    OR?: GameDefinitionWhereInput[]
    NOT?: GameDefinitionWhereInput | GameDefinitionWhereInput[]
    slug?: StringFilter<"GameDefinition"> | string
    displayName?: StringFilter<"GameDefinition"> | string
    icon?: StringFilter<"GameDefinition"> | string
    color?: StringFilter<"GameDefinition"> | string
    description?: StringFilter<"GameDefinition"> | string
    recommendedRamGB?: FloatFilter<"GameDefinition"> | number
    requiredDiskGB?: FloatFilter<"GameDefinition"> | number
    ownerId?: StringNullableFilter<"GameDefinition"> | string | null
    isBuiltIn?: BoolFilter<"GameDefinition"> | boolean
    installMethod?: StringFilter<"GameDefinition"> | string
    spec?: StringFilter<"GameDefinition"> | string
    createdAt?: DateTimeFilter<"GameDefinition"> | Date | string
    updatedAt?: DateTimeFilter<"GameDefinition"> | Date | string
    owner?: XOR<UserNullableRelationFilter, UserWhereInput> | null
    servers?: ServerListRelationFilter
  }, "id" | "ownerId_slug">

  export type GameDefinitionOrderByWithAggregationInput = {
    id?: SortOrder
    slug?: SortOrder
    displayName?: SortOrder
    icon?: SortOrder
    color?: SortOrder
    description?: SortOrder
    recommendedRamGB?: SortOrder
    requiredDiskGB?: SortOrder
    ownerId?: SortOrderInput | SortOrder
    isBuiltIn?: SortOrder
    installMethod?: SortOrder
    spec?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: GameDefinitionCountOrderByAggregateInput
    _avg?: GameDefinitionAvgOrderByAggregateInput
    _max?: GameDefinitionMaxOrderByAggregateInput
    _min?: GameDefinitionMinOrderByAggregateInput
    _sum?: GameDefinitionSumOrderByAggregateInput
  }

  export type GameDefinitionScalarWhereWithAggregatesInput = {
    AND?: GameDefinitionScalarWhereWithAggregatesInput | GameDefinitionScalarWhereWithAggregatesInput[]
    OR?: GameDefinitionScalarWhereWithAggregatesInput[]
    NOT?: GameDefinitionScalarWhereWithAggregatesInput | GameDefinitionScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"GameDefinition"> | string
    slug?: StringWithAggregatesFilter<"GameDefinition"> | string
    displayName?: StringWithAggregatesFilter<"GameDefinition"> | string
    icon?: StringWithAggregatesFilter<"GameDefinition"> | string
    color?: StringWithAggregatesFilter<"GameDefinition"> | string
    description?: StringWithAggregatesFilter<"GameDefinition"> | string
    recommendedRamGB?: FloatWithAggregatesFilter<"GameDefinition"> | number
    requiredDiskGB?: FloatWithAggregatesFilter<"GameDefinition"> | number
    ownerId?: StringNullableWithAggregatesFilter<"GameDefinition"> | string | null
    isBuiltIn?: BoolWithAggregatesFilter<"GameDefinition"> | boolean
    installMethod?: StringWithAggregatesFilter<"GameDefinition"> | string
    spec?: StringWithAggregatesFilter<"GameDefinition"> | string
    createdAt?: DateTimeWithAggregatesFilter<"GameDefinition"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"GameDefinition"> | Date | string
  }

  export type UserCreateInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionCreateNestedManyWithoutOwnerInput
    subscription?: SubscriptionCreateNestedOneWithoutUserInput
    servers?: ServerCreateNestedManyWithoutUserInput
    archives?: ArchiveCreateNestedManyWithoutUserInput
    logs?: ActivityLogCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionUncheckedCreateNestedManyWithoutOwnerInput
    subscription?: SubscriptionUncheckedCreateNestedOneWithoutUserInput
    servers?: ServerUncheckedCreateNestedManyWithoutUserInput
    archives?: ArchiveUncheckedCreateNestedManyWithoutUserInput
    logs?: ActivityLogUncheckedCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUpdateManyWithoutOwnerNestedInput
    subscription?: SubscriptionUpdateOneWithoutUserNestedInput
    servers?: ServerUpdateManyWithoutUserNestedInput
    archives?: ArchiveUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUncheckedUpdateManyWithoutOwnerNestedInput
    subscription?: SubscriptionUncheckedUpdateOneWithoutUserNestedInput
    servers?: ServerUncheckedUpdateManyWithoutUserNestedInput
    archives?: ArchiveUncheckedUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUncheckedUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserCreateManyInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
  }

  export type UserUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
  }

  export type UserUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
  }

  export type SubscriptionCreateInput = {
    id?: string
    plan: string
    status: string
    activeSlots: number
    createdAt?: Date | string
    updatedAt?: Date | string
    user: UserCreateNestedOneWithoutSubscriptionInput
  }

  export type SubscriptionUncheckedCreateInput = {
    id?: string
    userId: string
    plan: string
    status: string
    activeSlots: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SubscriptionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    plan?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    activeSlots?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutSubscriptionNestedInput
  }

  export type SubscriptionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    plan?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    activeSlots?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SubscriptionCreateManyInput = {
    id?: string
    userId: string
    plan: string
    status: string
    activeSlots: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SubscriptionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    plan?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    activeSlots?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SubscriptionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    plan?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    activeSlots?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ServerCreateInput = {
    id?: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
    user: UserCreateNestedOneWithoutServersInput
    definition?: GameDefinitionCreateNestedOneWithoutServersInput
    backups?: BackupCreateNestedManyWithoutServerInput
    collaborators?: CollaboratorCreateNestedManyWithoutServerInput
  }

  export type ServerUncheckedCreateInput = {
    id?: string
    userId: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    definitionId?: string | null
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
    backups?: BackupUncheckedCreateNestedManyWithoutServerInput
    collaborators?: CollaboratorUncheckedCreateNestedManyWithoutServerInput
  }

  export type ServerUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    user?: UserUpdateOneRequiredWithoutServersNestedInput
    definition?: GameDefinitionUpdateOneWithoutServersNestedInput
    backups?: BackupUpdateManyWithoutServerNestedInput
    collaborators?: CollaboratorUpdateManyWithoutServerNestedInput
  }

  export type ServerUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    definitionId?: NullableStringFieldUpdateOperationsInput | string | null
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    backups?: BackupUncheckedUpdateManyWithoutServerNestedInput
    collaborators?: CollaboratorUncheckedUpdateManyWithoutServerNestedInput
  }

  export type ServerCreateManyInput = {
    id?: string
    userId: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    definitionId?: string | null
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
  }

  export type ServerUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ServerUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    definitionId?: NullableStringFieldUpdateOperationsInput | string | null
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ArchiveCreateInput = {
    id?: string
    serverName: string
    game: string
    saveSizeGB: number
    archivedAt?: Date | string
    createdAt?: Date | string
    user: UserCreateNestedOneWithoutArchivesInput
  }

  export type ArchiveUncheckedCreateInput = {
    id?: string
    userId: string
    serverName: string
    game: string
    saveSizeGB: number
    archivedAt?: Date | string
    createdAt?: Date | string
  }

  export type ArchiveUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    serverName?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    saveSizeGB?: FloatFieldUpdateOperationsInput | number
    archivedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutArchivesNestedInput
  }

  export type ArchiveUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    serverName?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    saveSizeGB?: FloatFieldUpdateOperationsInput | number
    archivedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ArchiveCreateManyInput = {
    id?: string
    userId: string
    serverName: string
    game: string
    saveSizeGB: number
    archivedAt?: Date | string
    createdAt?: Date | string
  }

  export type ArchiveUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    serverName?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    saveSizeGB?: FloatFieldUpdateOperationsInput | number
    archivedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ArchiveUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    serverName?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    saveSizeGB?: FloatFieldUpdateOperationsInput | number
    archivedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ActivityLogCreateInput = {
    id?: string
    action: string
    details: string
    createdAt?: Date | string
    user: UserCreateNestedOneWithoutLogsInput
  }

  export type ActivityLogUncheckedCreateInput = {
    id?: string
    userId: string
    action: string
    details: string
    createdAt?: Date | string
  }

  export type ActivityLogUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    details?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutLogsNestedInput
  }

  export type ActivityLogUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    details?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ActivityLogCreateManyInput = {
    id?: string
    userId: string
    action: string
    details: string
    createdAt?: Date | string
  }

  export type ActivityLogUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    details?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ActivityLogUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    details?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BackupCreateInput = {
    id?: string
    userId: string
    name: string
    game: string
    filePath: string
    fileSizeMB: number
    backupType: string
    createdAt?: Date | string
    server: ServerCreateNestedOneWithoutBackupsInput
  }

  export type BackupUncheckedCreateInput = {
    id?: string
    serverId: string
    userId: string
    name: string
    game: string
    filePath: string
    fileSizeMB: number
    backupType: string
    createdAt?: Date | string
  }

  export type BackupUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSizeMB?: FloatFieldUpdateOperationsInput | number
    backupType?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    server?: ServerUpdateOneRequiredWithoutBackupsNestedInput
  }

  export type BackupUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    serverId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSizeMB?: FloatFieldUpdateOperationsInput | number
    backupType?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BackupCreateManyInput = {
    id?: string
    serverId: string
    userId: string
    name: string
    game: string
    filePath: string
    fileSizeMB: number
    backupType: string
    createdAt?: Date | string
  }

  export type BackupUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSizeMB?: FloatFieldUpdateOperationsInput | number
    backupType?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BackupUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    serverId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSizeMB?: FloatFieldUpdateOperationsInput | number
    backupType?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CollaboratorCreateInput = {
    id?: string
    role: string
    createdAt?: Date | string
    server: ServerCreateNestedOneWithoutCollaboratorsInput
    user: UserCreateNestedOneWithoutCollaboratorAccessInput
  }

  export type CollaboratorUncheckedCreateInput = {
    id?: string
    serverId: string
    userId: string
    role: string
    createdAt?: Date | string
  }

  export type CollaboratorUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    server?: ServerUpdateOneRequiredWithoutCollaboratorsNestedInput
    user?: UserUpdateOneRequiredWithoutCollaboratorAccessNestedInput
  }

  export type CollaboratorUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    serverId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CollaboratorCreateManyInput = {
    id?: string
    serverId: string
    userId: string
    role: string
    createdAt?: Date | string
  }

  export type CollaboratorUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CollaboratorUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    serverId?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type GameDefinitionCreateInput = {
    id?: string
    slug: string
    displayName: string
    icon?: string
    color?: string
    description?: string
    recommendedRamGB?: number
    requiredDiskGB?: number
    isBuiltIn?: boolean
    installMethod: string
    spec: string
    createdAt?: Date | string
    updatedAt?: Date | string
    owner?: UserCreateNestedOneWithoutDefinitionsInput
    servers?: ServerCreateNestedManyWithoutDefinitionInput
  }

  export type GameDefinitionUncheckedCreateInput = {
    id?: string
    slug: string
    displayName: string
    icon?: string
    color?: string
    description?: string
    recommendedRamGB?: number
    requiredDiskGB?: number
    ownerId?: string | null
    isBuiltIn?: boolean
    installMethod: string
    spec: string
    createdAt?: Date | string
    updatedAt?: Date | string
    servers?: ServerUncheckedCreateNestedManyWithoutDefinitionInput
  }

  export type GameDefinitionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    icon?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    description?: StringFieldUpdateOperationsInput | string
    recommendedRamGB?: FloatFieldUpdateOperationsInput | number
    requiredDiskGB?: FloatFieldUpdateOperationsInput | number
    isBuiltIn?: BoolFieldUpdateOperationsInput | boolean
    installMethod?: StringFieldUpdateOperationsInput | string
    spec?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    owner?: UserUpdateOneWithoutDefinitionsNestedInput
    servers?: ServerUpdateManyWithoutDefinitionNestedInput
  }

  export type GameDefinitionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    icon?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    description?: StringFieldUpdateOperationsInput | string
    recommendedRamGB?: FloatFieldUpdateOperationsInput | number
    requiredDiskGB?: FloatFieldUpdateOperationsInput | number
    ownerId?: NullableStringFieldUpdateOperationsInput | string | null
    isBuiltIn?: BoolFieldUpdateOperationsInput | boolean
    installMethod?: StringFieldUpdateOperationsInput | string
    spec?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    servers?: ServerUncheckedUpdateManyWithoutDefinitionNestedInput
  }

  export type GameDefinitionCreateManyInput = {
    id?: string
    slug: string
    displayName: string
    icon?: string
    color?: string
    description?: string
    recommendedRamGB?: number
    requiredDiskGB?: number
    ownerId?: string | null
    isBuiltIn?: boolean
    installMethod: string
    spec: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type GameDefinitionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    icon?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    description?: StringFieldUpdateOperationsInput | string
    recommendedRamGB?: FloatFieldUpdateOperationsInput | number
    requiredDiskGB?: FloatFieldUpdateOperationsInput | number
    isBuiltIn?: BoolFieldUpdateOperationsInput | boolean
    installMethod?: StringFieldUpdateOperationsInput | string
    spec?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type GameDefinitionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    icon?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    description?: StringFieldUpdateOperationsInput | string
    recommendedRamGB?: FloatFieldUpdateOperationsInput | number
    requiredDiskGB?: FloatFieldUpdateOperationsInput | number
    ownerId?: NullableStringFieldUpdateOperationsInput | string | null
    isBuiltIn?: BoolFieldUpdateOperationsInput | boolean
    installMethod?: StringFieldUpdateOperationsInput | string
    spec?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type GameDefinitionListRelationFilter = {
    every?: GameDefinitionWhereInput
    some?: GameDefinitionWhereInput
    none?: GameDefinitionWhereInput
  }

  export type SubscriptionNullableRelationFilter = {
    is?: SubscriptionWhereInput | null
    isNot?: SubscriptionWhereInput | null
  }

  export type ServerListRelationFilter = {
    every?: ServerWhereInput
    some?: ServerWhereInput
    none?: ServerWhereInput
  }

  export type ArchiveListRelationFilter = {
    every?: ArchiveWhereInput
    some?: ArchiveWhereInput
    none?: ArchiveWhereInput
  }

  export type ActivityLogListRelationFilter = {
    every?: ActivityLogWhereInput
    some?: ActivityLogWhereInput
    none?: ActivityLogWhereInput
  }

  export type CollaboratorListRelationFilter = {
    every?: CollaboratorWhereInput
    some?: CollaboratorWhereInput
    none?: CollaboratorWhereInput
  }

  export type GameDefinitionOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ServerOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ArchiveOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ActivityLogOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type CollaboratorOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type UserCountOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    passwordHash?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    role?: SortOrder
  }

  export type UserMaxOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    passwordHash?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    role?: SortOrder
  }

  export type UserMinOrderByAggregateInput = {
    id?: SortOrder
    email?: SortOrder
    passwordHash?: SortOrder
    name?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    role?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type UserRelationFilter = {
    is?: UserWhereInput
    isNot?: UserWhereInput
  }

  export type SubscriptionCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    plan?: SortOrder
    status?: SortOrder
    activeSlots?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SubscriptionAvgOrderByAggregateInput = {
    activeSlots?: SortOrder
  }

  export type SubscriptionMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    plan?: SortOrder
    status?: SortOrder
    activeSlots?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SubscriptionMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    plan?: SortOrder
    status?: SortOrder
    activeSlots?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SubscriptionSumOrderByAggregateInput = {
    activeSlots?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type FloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type GameDefinitionNullableRelationFilter = {
    is?: GameDefinitionWhereInput | null
    isNot?: GameDefinitionWhereInput | null
  }

  export type BackupListRelationFilter = {
    every?: BackupWhereInput
    some?: BackupWhereInput
    none?: BackupWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type BackupOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ServerCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    game?: SortOrder
    ramAllocation?: SortOrder
    region?: SortOrder
    status?: SortOrder
    runnerType?: SortOrder
    localPath?: SortOrder
    pid?: SortOrder
    password?: SortOrder
    enableUpnp?: SortOrder
    ipAddress?: SortOrder
    port?: SortOrder
    definitionId?: SortOrder
    paramValues?: SortOrder
    cpuUsage?: SortOrder
    memoryUsage?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    snapshotInterval?: SortOrder
    lastSnapshotAt?: SortOrder
  }

  export type ServerAvgOrderByAggregateInput = {
    ramAllocation?: SortOrder
    pid?: SortOrder
    port?: SortOrder
    cpuUsage?: SortOrder
    memoryUsage?: SortOrder
    snapshotInterval?: SortOrder
  }

  export type ServerMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    game?: SortOrder
    ramAllocation?: SortOrder
    region?: SortOrder
    status?: SortOrder
    runnerType?: SortOrder
    localPath?: SortOrder
    pid?: SortOrder
    password?: SortOrder
    enableUpnp?: SortOrder
    ipAddress?: SortOrder
    port?: SortOrder
    definitionId?: SortOrder
    paramValues?: SortOrder
    cpuUsage?: SortOrder
    memoryUsage?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    snapshotInterval?: SortOrder
    lastSnapshotAt?: SortOrder
  }

  export type ServerMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    game?: SortOrder
    ramAllocation?: SortOrder
    region?: SortOrder
    status?: SortOrder
    runnerType?: SortOrder
    localPath?: SortOrder
    pid?: SortOrder
    password?: SortOrder
    enableUpnp?: SortOrder
    ipAddress?: SortOrder
    port?: SortOrder
    definitionId?: SortOrder
    paramValues?: SortOrder
    cpuUsage?: SortOrder
    memoryUsage?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    snapshotInterval?: SortOrder
    lastSnapshotAt?: SortOrder
  }

  export type ServerSumOrderByAggregateInput = {
    ramAllocation?: SortOrder
    pid?: SortOrder
    port?: SortOrder
    cpuUsage?: SortOrder
    memoryUsage?: SortOrder
    snapshotInterval?: SortOrder
  }

  export type FloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type ArchiveCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    serverName?: SortOrder
    game?: SortOrder
    saveSizeGB?: SortOrder
    archivedAt?: SortOrder
    createdAt?: SortOrder
  }

  export type ArchiveAvgOrderByAggregateInput = {
    saveSizeGB?: SortOrder
  }

  export type ArchiveMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    serverName?: SortOrder
    game?: SortOrder
    saveSizeGB?: SortOrder
    archivedAt?: SortOrder
    createdAt?: SortOrder
  }

  export type ArchiveMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    serverName?: SortOrder
    game?: SortOrder
    saveSizeGB?: SortOrder
    archivedAt?: SortOrder
    createdAt?: SortOrder
  }

  export type ArchiveSumOrderByAggregateInput = {
    saveSizeGB?: SortOrder
  }

  export type ActivityLogCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    action?: SortOrder
    details?: SortOrder
    createdAt?: SortOrder
  }

  export type ActivityLogMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    action?: SortOrder
    details?: SortOrder
    createdAt?: SortOrder
  }

  export type ActivityLogMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    action?: SortOrder
    details?: SortOrder
    createdAt?: SortOrder
  }

  export type ServerRelationFilter = {
    is?: ServerWhereInput
    isNot?: ServerWhereInput
  }

  export type BackupCountOrderByAggregateInput = {
    id?: SortOrder
    serverId?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    game?: SortOrder
    filePath?: SortOrder
    fileSizeMB?: SortOrder
    backupType?: SortOrder
    createdAt?: SortOrder
  }

  export type BackupAvgOrderByAggregateInput = {
    fileSizeMB?: SortOrder
  }

  export type BackupMaxOrderByAggregateInput = {
    id?: SortOrder
    serverId?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    game?: SortOrder
    filePath?: SortOrder
    fileSizeMB?: SortOrder
    backupType?: SortOrder
    createdAt?: SortOrder
  }

  export type BackupMinOrderByAggregateInput = {
    id?: SortOrder
    serverId?: SortOrder
    userId?: SortOrder
    name?: SortOrder
    game?: SortOrder
    filePath?: SortOrder
    fileSizeMB?: SortOrder
    backupType?: SortOrder
    createdAt?: SortOrder
  }

  export type BackupSumOrderByAggregateInput = {
    fileSizeMB?: SortOrder
  }

  export type CollaboratorServerIdUserIdCompoundUniqueInput = {
    serverId: string
    userId: string
  }

  export type CollaboratorCountOrderByAggregateInput = {
    id?: SortOrder
    serverId?: SortOrder
    userId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
  }

  export type CollaboratorMaxOrderByAggregateInput = {
    id?: SortOrder
    serverId?: SortOrder
    userId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
  }

  export type CollaboratorMinOrderByAggregateInput = {
    id?: SortOrder
    serverId?: SortOrder
    userId?: SortOrder
    role?: SortOrder
    createdAt?: SortOrder
  }

  export type UserNullableRelationFilter = {
    is?: UserWhereInput | null
    isNot?: UserWhereInput | null
  }

  export type GameDefinitionOwnerIdSlugCompoundUniqueInput = {
    ownerId: string
    slug: string
  }

  export type GameDefinitionCountOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    displayName?: SortOrder
    icon?: SortOrder
    color?: SortOrder
    description?: SortOrder
    recommendedRamGB?: SortOrder
    requiredDiskGB?: SortOrder
    ownerId?: SortOrder
    isBuiltIn?: SortOrder
    installMethod?: SortOrder
    spec?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type GameDefinitionAvgOrderByAggregateInput = {
    recommendedRamGB?: SortOrder
    requiredDiskGB?: SortOrder
  }

  export type GameDefinitionMaxOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    displayName?: SortOrder
    icon?: SortOrder
    color?: SortOrder
    description?: SortOrder
    recommendedRamGB?: SortOrder
    requiredDiskGB?: SortOrder
    ownerId?: SortOrder
    isBuiltIn?: SortOrder
    installMethod?: SortOrder
    spec?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type GameDefinitionMinOrderByAggregateInput = {
    id?: SortOrder
    slug?: SortOrder
    displayName?: SortOrder
    icon?: SortOrder
    color?: SortOrder
    description?: SortOrder
    recommendedRamGB?: SortOrder
    requiredDiskGB?: SortOrder
    ownerId?: SortOrder
    isBuiltIn?: SortOrder
    installMethod?: SortOrder
    spec?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type GameDefinitionSumOrderByAggregateInput = {
    recommendedRamGB?: SortOrder
    requiredDiskGB?: SortOrder
  }

  export type GameDefinitionCreateNestedManyWithoutOwnerInput = {
    create?: XOR<GameDefinitionCreateWithoutOwnerInput, GameDefinitionUncheckedCreateWithoutOwnerInput> | GameDefinitionCreateWithoutOwnerInput[] | GameDefinitionUncheckedCreateWithoutOwnerInput[]
    connectOrCreate?: GameDefinitionCreateOrConnectWithoutOwnerInput | GameDefinitionCreateOrConnectWithoutOwnerInput[]
    createMany?: GameDefinitionCreateManyOwnerInputEnvelope
    connect?: GameDefinitionWhereUniqueInput | GameDefinitionWhereUniqueInput[]
  }

  export type SubscriptionCreateNestedOneWithoutUserInput = {
    create?: XOR<SubscriptionCreateWithoutUserInput, SubscriptionUncheckedCreateWithoutUserInput>
    connectOrCreate?: SubscriptionCreateOrConnectWithoutUserInput
    connect?: SubscriptionWhereUniqueInput
  }

  export type ServerCreateNestedManyWithoutUserInput = {
    create?: XOR<ServerCreateWithoutUserInput, ServerUncheckedCreateWithoutUserInput> | ServerCreateWithoutUserInput[] | ServerUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ServerCreateOrConnectWithoutUserInput | ServerCreateOrConnectWithoutUserInput[]
    createMany?: ServerCreateManyUserInputEnvelope
    connect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
  }

  export type ArchiveCreateNestedManyWithoutUserInput = {
    create?: XOR<ArchiveCreateWithoutUserInput, ArchiveUncheckedCreateWithoutUserInput> | ArchiveCreateWithoutUserInput[] | ArchiveUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ArchiveCreateOrConnectWithoutUserInput | ArchiveCreateOrConnectWithoutUserInput[]
    createMany?: ArchiveCreateManyUserInputEnvelope
    connect?: ArchiveWhereUniqueInput | ArchiveWhereUniqueInput[]
  }

  export type ActivityLogCreateNestedManyWithoutUserInput = {
    create?: XOR<ActivityLogCreateWithoutUserInput, ActivityLogUncheckedCreateWithoutUserInput> | ActivityLogCreateWithoutUserInput[] | ActivityLogUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ActivityLogCreateOrConnectWithoutUserInput | ActivityLogCreateOrConnectWithoutUserInput[]
    createMany?: ActivityLogCreateManyUserInputEnvelope
    connect?: ActivityLogWhereUniqueInput | ActivityLogWhereUniqueInput[]
  }

  export type CollaboratorCreateNestedManyWithoutUserInput = {
    create?: XOR<CollaboratorCreateWithoutUserInput, CollaboratorUncheckedCreateWithoutUserInput> | CollaboratorCreateWithoutUserInput[] | CollaboratorUncheckedCreateWithoutUserInput[]
    connectOrCreate?: CollaboratorCreateOrConnectWithoutUserInput | CollaboratorCreateOrConnectWithoutUserInput[]
    createMany?: CollaboratorCreateManyUserInputEnvelope
    connect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
  }

  export type GameDefinitionUncheckedCreateNestedManyWithoutOwnerInput = {
    create?: XOR<GameDefinitionCreateWithoutOwnerInput, GameDefinitionUncheckedCreateWithoutOwnerInput> | GameDefinitionCreateWithoutOwnerInput[] | GameDefinitionUncheckedCreateWithoutOwnerInput[]
    connectOrCreate?: GameDefinitionCreateOrConnectWithoutOwnerInput | GameDefinitionCreateOrConnectWithoutOwnerInput[]
    createMany?: GameDefinitionCreateManyOwnerInputEnvelope
    connect?: GameDefinitionWhereUniqueInput | GameDefinitionWhereUniqueInput[]
  }

  export type SubscriptionUncheckedCreateNestedOneWithoutUserInput = {
    create?: XOR<SubscriptionCreateWithoutUserInput, SubscriptionUncheckedCreateWithoutUserInput>
    connectOrCreate?: SubscriptionCreateOrConnectWithoutUserInput
    connect?: SubscriptionWhereUniqueInput
  }

  export type ServerUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<ServerCreateWithoutUserInput, ServerUncheckedCreateWithoutUserInput> | ServerCreateWithoutUserInput[] | ServerUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ServerCreateOrConnectWithoutUserInput | ServerCreateOrConnectWithoutUserInput[]
    createMany?: ServerCreateManyUserInputEnvelope
    connect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
  }

  export type ArchiveUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<ArchiveCreateWithoutUserInput, ArchiveUncheckedCreateWithoutUserInput> | ArchiveCreateWithoutUserInput[] | ArchiveUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ArchiveCreateOrConnectWithoutUserInput | ArchiveCreateOrConnectWithoutUserInput[]
    createMany?: ArchiveCreateManyUserInputEnvelope
    connect?: ArchiveWhereUniqueInput | ArchiveWhereUniqueInput[]
  }

  export type ActivityLogUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<ActivityLogCreateWithoutUserInput, ActivityLogUncheckedCreateWithoutUserInput> | ActivityLogCreateWithoutUserInput[] | ActivityLogUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ActivityLogCreateOrConnectWithoutUserInput | ActivityLogCreateOrConnectWithoutUserInput[]
    createMany?: ActivityLogCreateManyUserInputEnvelope
    connect?: ActivityLogWhereUniqueInput | ActivityLogWhereUniqueInput[]
  }

  export type CollaboratorUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<CollaboratorCreateWithoutUserInput, CollaboratorUncheckedCreateWithoutUserInput> | CollaboratorCreateWithoutUserInput[] | CollaboratorUncheckedCreateWithoutUserInput[]
    connectOrCreate?: CollaboratorCreateOrConnectWithoutUserInput | CollaboratorCreateOrConnectWithoutUserInput[]
    createMany?: CollaboratorCreateManyUserInputEnvelope
    connect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type GameDefinitionUpdateManyWithoutOwnerNestedInput = {
    create?: XOR<GameDefinitionCreateWithoutOwnerInput, GameDefinitionUncheckedCreateWithoutOwnerInput> | GameDefinitionCreateWithoutOwnerInput[] | GameDefinitionUncheckedCreateWithoutOwnerInput[]
    connectOrCreate?: GameDefinitionCreateOrConnectWithoutOwnerInput | GameDefinitionCreateOrConnectWithoutOwnerInput[]
    upsert?: GameDefinitionUpsertWithWhereUniqueWithoutOwnerInput | GameDefinitionUpsertWithWhereUniqueWithoutOwnerInput[]
    createMany?: GameDefinitionCreateManyOwnerInputEnvelope
    set?: GameDefinitionWhereUniqueInput | GameDefinitionWhereUniqueInput[]
    disconnect?: GameDefinitionWhereUniqueInput | GameDefinitionWhereUniqueInput[]
    delete?: GameDefinitionWhereUniqueInput | GameDefinitionWhereUniqueInput[]
    connect?: GameDefinitionWhereUniqueInput | GameDefinitionWhereUniqueInput[]
    update?: GameDefinitionUpdateWithWhereUniqueWithoutOwnerInput | GameDefinitionUpdateWithWhereUniqueWithoutOwnerInput[]
    updateMany?: GameDefinitionUpdateManyWithWhereWithoutOwnerInput | GameDefinitionUpdateManyWithWhereWithoutOwnerInput[]
    deleteMany?: GameDefinitionScalarWhereInput | GameDefinitionScalarWhereInput[]
  }

  export type SubscriptionUpdateOneWithoutUserNestedInput = {
    create?: XOR<SubscriptionCreateWithoutUserInput, SubscriptionUncheckedCreateWithoutUserInput>
    connectOrCreate?: SubscriptionCreateOrConnectWithoutUserInput
    upsert?: SubscriptionUpsertWithoutUserInput
    disconnect?: SubscriptionWhereInput | boolean
    delete?: SubscriptionWhereInput | boolean
    connect?: SubscriptionWhereUniqueInput
    update?: XOR<XOR<SubscriptionUpdateToOneWithWhereWithoutUserInput, SubscriptionUpdateWithoutUserInput>, SubscriptionUncheckedUpdateWithoutUserInput>
  }

  export type ServerUpdateManyWithoutUserNestedInput = {
    create?: XOR<ServerCreateWithoutUserInput, ServerUncheckedCreateWithoutUserInput> | ServerCreateWithoutUserInput[] | ServerUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ServerCreateOrConnectWithoutUserInput | ServerCreateOrConnectWithoutUserInput[]
    upsert?: ServerUpsertWithWhereUniqueWithoutUserInput | ServerUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ServerCreateManyUserInputEnvelope
    set?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    disconnect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    delete?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    connect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    update?: ServerUpdateWithWhereUniqueWithoutUserInput | ServerUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ServerUpdateManyWithWhereWithoutUserInput | ServerUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ServerScalarWhereInput | ServerScalarWhereInput[]
  }

  export type ArchiveUpdateManyWithoutUserNestedInput = {
    create?: XOR<ArchiveCreateWithoutUserInput, ArchiveUncheckedCreateWithoutUserInput> | ArchiveCreateWithoutUserInput[] | ArchiveUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ArchiveCreateOrConnectWithoutUserInput | ArchiveCreateOrConnectWithoutUserInput[]
    upsert?: ArchiveUpsertWithWhereUniqueWithoutUserInput | ArchiveUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ArchiveCreateManyUserInputEnvelope
    set?: ArchiveWhereUniqueInput | ArchiveWhereUniqueInput[]
    disconnect?: ArchiveWhereUniqueInput | ArchiveWhereUniqueInput[]
    delete?: ArchiveWhereUniqueInput | ArchiveWhereUniqueInput[]
    connect?: ArchiveWhereUniqueInput | ArchiveWhereUniqueInput[]
    update?: ArchiveUpdateWithWhereUniqueWithoutUserInput | ArchiveUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ArchiveUpdateManyWithWhereWithoutUserInput | ArchiveUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ArchiveScalarWhereInput | ArchiveScalarWhereInput[]
  }

  export type ActivityLogUpdateManyWithoutUserNestedInput = {
    create?: XOR<ActivityLogCreateWithoutUserInput, ActivityLogUncheckedCreateWithoutUserInput> | ActivityLogCreateWithoutUserInput[] | ActivityLogUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ActivityLogCreateOrConnectWithoutUserInput | ActivityLogCreateOrConnectWithoutUserInput[]
    upsert?: ActivityLogUpsertWithWhereUniqueWithoutUserInput | ActivityLogUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ActivityLogCreateManyUserInputEnvelope
    set?: ActivityLogWhereUniqueInput | ActivityLogWhereUniqueInput[]
    disconnect?: ActivityLogWhereUniqueInput | ActivityLogWhereUniqueInput[]
    delete?: ActivityLogWhereUniqueInput | ActivityLogWhereUniqueInput[]
    connect?: ActivityLogWhereUniqueInput | ActivityLogWhereUniqueInput[]
    update?: ActivityLogUpdateWithWhereUniqueWithoutUserInput | ActivityLogUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ActivityLogUpdateManyWithWhereWithoutUserInput | ActivityLogUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ActivityLogScalarWhereInput | ActivityLogScalarWhereInput[]
  }

  export type CollaboratorUpdateManyWithoutUserNestedInput = {
    create?: XOR<CollaboratorCreateWithoutUserInput, CollaboratorUncheckedCreateWithoutUserInput> | CollaboratorCreateWithoutUserInput[] | CollaboratorUncheckedCreateWithoutUserInput[]
    connectOrCreate?: CollaboratorCreateOrConnectWithoutUserInput | CollaboratorCreateOrConnectWithoutUserInput[]
    upsert?: CollaboratorUpsertWithWhereUniqueWithoutUserInput | CollaboratorUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: CollaboratorCreateManyUserInputEnvelope
    set?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    disconnect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    delete?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    connect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    update?: CollaboratorUpdateWithWhereUniqueWithoutUserInput | CollaboratorUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: CollaboratorUpdateManyWithWhereWithoutUserInput | CollaboratorUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: CollaboratorScalarWhereInput | CollaboratorScalarWhereInput[]
  }

  export type GameDefinitionUncheckedUpdateManyWithoutOwnerNestedInput = {
    create?: XOR<GameDefinitionCreateWithoutOwnerInput, GameDefinitionUncheckedCreateWithoutOwnerInput> | GameDefinitionCreateWithoutOwnerInput[] | GameDefinitionUncheckedCreateWithoutOwnerInput[]
    connectOrCreate?: GameDefinitionCreateOrConnectWithoutOwnerInput | GameDefinitionCreateOrConnectWithoutOwnerInput[]
    upsert?: GameDefinitionUpsertWithWhereUniqueWithoutOwnerInput | GameDefinitionUpsertWithWhereUniqueWithoutOwnerInput[]
    createMany?: GameDefinitionCreateManyOwnerInputEnvelope
    set?: GameDefinitionWhereUniqueInput | GameDefinitionWhereUniqueInput[]
    disconnect?: GameDefinitionWhereUniqueInput | GameDefinitionWhereUniqueInput[]
    delete?: GameDefinitionWhereUniqueInput | GameDefinitionWhereUniqueInput[]
    connect?: GameDefinitionWhereUniqueInput | GameDefinitionWhereUniqueInput[]
    update?: GameDefinitionUpdateWithWhereUniqueWithoutOwnerInput | GameDefinitionUpdateWithWhereUniqueWithoutOwnerInput[]
    updateMany?: GameDefinitionUpdateManyWithWhereWithoutOwnerInput | GameDefinitionUpdateManyWithWhereWithoutOwnerInput[]
    deleteMany?: GameDefinitionScalarWhereInput | GameDefinitionScalarWhereInput[]
  }

  export type SubscriptionUncheckedUpdateOneWithoutUserNestedInput = {
    create?: XOR<SubscriptionCreateWithoutUserInput, SubscriptionUncheckedCreateWithoutUserInput>
    connectOrCreate?: SubscriptionCreateOrConnectWithoutUserInput
    upsert?: SubscriptionUpsertWithoutUserInput
    disconnect?: SubscriptionWhereInput | boolean
    delete?: SubscriptionWhereInput | boolean
    connect?: SubscriptionWhereUniqueInput
    update?: XOR<XOR<SubscriptionUpdateToOneWithWhereWithoutUserInput, SubscriptionUpdateWithoutUserInput>, SubscriptionUncheckedUpdateWithoutUserInput>
  }

  export type ServerUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<ServerCreateWithoutUserInput, ServerUncheckedCreateWithoutUserInput> | ServerCreateWithoutUserInput[] | ServerUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ServerCreateOrConnectWithoutUserInput | ServerCreateOrConnectWithoutUserInput[]
    upsert?: ServerUpsertWithWhereUniqueWithoutUserInput | ServerUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ServerCreateManyUserInputEnvelope
    set?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    disconnect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    delete?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    connect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    update?: ServerUpdateWithWhereUniqueWithoutUserInput | ServerUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ServerUpdateManyWithWhereWithoutUserInput | ServerUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ServerScalarWhereInput | ServerScalarWhereInput[]
  }

  export type ArchiveUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<ArchiveCreateWithoutUserInput, ArchiveUncheckedCreateWithoutUserInput> | ArchiveCreateWithoutUserInput[] | ArchiveUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ArchiveCreateOrConnectWithoutUserInput | ArchiveCreateOrConnectWithoutUserInput[]
    upsert?: ArchiveUpsertWithWhereUniqueWithoutUserInput | ArchiveUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ArchiveCreateManyUserInputEnvelope
    set?: ArchiveWhereUniqueInput | ArchiveWhereUniqueInput[]
    disconnect?: ArchiveWhereUniqueInput | ArchiveWhereUniqueInput[]
    delete?: ArchiveWhereUniqueInput | ArchiveWhereUniqueInput[]
    connect?: ArchiveWhereUniqueInput | ArchiveWhereUniqueInput[]
    update?: ArchiveUpdateWithWhereUniqueWithoutUserInput | ArchiveUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ArchiveUpdateManyWithWhereWithoutUserInput | ArchiveUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ArchiveScalarWhereInput | ArchiveScalarWhereInput[]
  }

  export type ActivityLogUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<ActivityLogCreateWithoutUserInput, ActivityLogUncheckedCreateWithoutUserInput> | ActivityLogCreateWithoutUserInput[] | ActivityLogUncheckedCreateWithoutUserInput[]
    connectOrCreate?: ActivityLogCreateOrConnectWithoutUserInput | ActivityLogCreateOrConnectWithoutUserInput[]
    upsert?: ActivityLogUpsertWithWhereUniqueWithoutUserInput | ActivityLogUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: ActivityLogCreateManyUserInputEnvelope
    set?: ActivityLogWhereUniqueInput | ActivityLogWhereUniqueInput[]
    disconnect?: ActivityLogWhereUniqueInput | ActivityLogWhereUniqueInput[]
    delete?: ActivityLogWhereUniqueInput | ActivityLogWhereUniqueInput[]
    connect?: ActivityLogWhereUniqueInput | ActivityLogWhereUniqueInput[]
    update?: ActivityLogUpdateWithWhereUniqueWithoutUserInput | ActivityLogUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: ActivityLogUpdateManyWithWhereWithoutUserInput | ActivityLogUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: ActivityLogScalarWhereInput | ActivityLogScalarWhereInput[]
  }

  export type CollaboratorUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<CollaboratorCreateWithoutUserInput, CollaboratorUncheckedCreateWithoutUserInput> | CollaboratorCreateWithoutUserInput[] | CollaboratorUncheckedCreateWithoutUserInput[]
    connectOrCreate?: CollaboratorCreateOrConnectWithoutUserInput | CollaboratorCreateOrConnectWithoutUserInput[]
    upsert?: CollaboratorUpsertWithWhereUniqueWithoutUserInput | CollaboratorUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: CollaboratorCreateManyUserInputEnvelope
    set?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    disconnect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    delete?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    connect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    update?: CollaboratorUpdateWithWhereUniqueWithoutUserInput | CollaboratorUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: CollaboratorUpdateManyWithWhereWithoutUserInput | CollaboratorUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: CollaboratorScalarWhereInput | CollaboratorScalarWhereInput[]
  }

  export type UserCreateNestedOneWithoutSubscriptionInput = {
    create?: XOR<UserCreateWithoutSubscriptionInput, UserUncheckedCreateWithoutSubscriptionInput>
    connectOrCreate?: UserCreateOrConnectWithoutSubscriptionInput
    connect?: UserWhereUniqueInput
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type UserUpdateOneRequiredWithoutSubscriptionNestedInput = {
    create?: XOR<UserCreateWithoutSubscriptionInput, UserUncheckedCreateWithoutSubscriptionInput>
    connectOrCreate?: UserCreateOrConnectWithoutSubscriptionInput
    upsert?: UserUpsertWithoutSubscriptionInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutSubscriptionInput, UserUpdateWithoutSubscriptionInput>, UserUncheckedUpdateWithoutSubscriptionInput>
  }

  export type UserCreateNestedOneWithoutServersInput = {
    create?: XOR<UserCreateWithoutServersInput, UserUncheckedCreateWithoutServersInput>
    connectOrCreate?: UserCreateOrConnectWithoutServersInput
    connect?: UserWhereUniqueInput
  }

  export type GameDefinitionCreateNestedOneWithoutServersInput = {
    create?: XOR<GameDefinitionCreateWithoutServersInput, GameDefinitionUncheckedCreateWithoutServersInput>
    connectOrCreate?: GameDefinitionCreateOrConnectWithoutServersInput
    connect?: GameDefinitionWhereUniqueInput
  }

  export type BackupCreateNestedManyWithoutServerInput = {
    create?: XOR<BackupCreateWithoutServerInput, BackupUncheckedCreateWithoutServerInput> | BackupCreateWithoutServerInput[] | BackupUncheckedCreateWithoutServerInput[]
    connectOrCreate?: BackupCreateOrConnectWithoutServerInput | BackupCreateOrConnectWithoutServerInput[]
    createMany?: BackupCreateManyServerInputEnvelope
    connect?: BackupWhereUniqueInput | BackupWhereUniqueInput[]
  }

  export type CollaboratorCreateNestedManyWithoutServerInput = {
    create?: XOR<CollaboratorCreateWithoutServerInput, CollaboratorUncheckedCreateWithoutServerInput> | CollaboratorCreateWithoutServerInput[] | CollaboratorUncheckedCreateWithoutServerInput[]
    connectOrCreate?: CollaboratorCreateOrConnectWithoutServerInput | CollaboratorCreateOrConnectWithoutServerInput[]
    createMany?: CollaboratorCreateManyServerInputEnvelope
    connect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
  }

  export type BackupUncheckedCreateNestedManyWithoutServerInput = {
    create?: XOR<BackupCreateWithoutServerInput, BackupUncheckedCreateWithoutServerInput> | BackupCreateWithoutServerInput[] | BackupUncheckedCreateWithoutServerInput[]
    connectOrCreate?: BackupCreateOrConnectWithoutServerInput | BackupCreateOrConnectWithoutServerInput[]
    createMany?: BackupCreateManyServerInputEnvelope
    connect?: BackupWhereUniqueInput | BackupWhereUniqueInput[]
  }

  export type CollaboratorUncheckedCreateNestedManyWithoutServerInput = {
    create?: XOR<CollaboratorCreateWithoutServerInput, CollaboratorUncheckedCreateWithoutServerInput> | CollaboratorCreateWithoutServerInput[] | CollaboratorUncheckedCreateWithoutServerInput[]
    connectOrCreate?: CollaboratorCreateOrConnectWithoutServerInput | CollaboratorCreateOrConnectWithoutServerInput[]
    createMany?: CollaboratorCreateManyServerInputEnvelope
    connect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
  }

  export type FloatFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type UserUpdateOneRequiredWithoutServersNestedInput = {
    create?: XOR<UserCreateWithoutServersInput, UserUncheckedCreateWithoutServersInput>
    connectOrCreate?: UserCreateOrConnectWithoutServersInput
    upsert?: UserUpsertWithoutServersInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutServersInput, UserUpdateWithoutServersInput>, UserUncheckedUpdateWithoutServersInput>
  }

  export type GameDefinitionUpdateOneWithoutServersNestedInput = {
    create?: XOR<GameDefinitionCreateWithoutServersInput, GameDefinitionUncheckedCreateWithoutServersInput>
    connectOrCreate?: GameDefinitionCreateOrConnectWithoutServersInput
    upsert?: GameDefinitionUpsertWithoutServersInput
    disconnect?: GameDefinitionWhereInput | boolean
    delete?: GameDefinitionWhereInput | boolean
    connect?: GameDefinitionWhereUniqueInput
    update?: XOR<XOR<GameDefinitionUpdateToOneWithWhereWithoutServersInput, GameDefinitionUpdateWithoutServersInput>, GameDefinitionUncheckedUpdateWithoutServersInput>
  }

  export type BackupUpdateManyWithoutServerNestedInput = {
    create?: XOR<BackupCreateWithoutServerInput, BackupUncheckedCreateWithoutServerInput> | BackupCreateWithoutServerInput[] | BackupUncheckedCreateWithoutServerInput[]
    connectOrCreate?: BackupCreateOrConnectWithoutServerInput | BackupCreateOrConnectWithoutServerInput[]
    upsert?: BackupUpsertWithWhereUniqueWithoutServerInput | BackupUpsertWithWhereUniqueWithoutServerInput[]
    createMany?: BackupCreateManyServerInputEnvelope
    set?: BackupWhereUniqueInput | BackupWhereUniqueInput[]
    disconnect?: BackupWhereUniqueInput | BackupWhereUniqueInput[]
    delete?: BackupWhereUniqueInput | BackupWhereUniqueInput[]
    connect?: BackupWhereUniqueInput | BackupWhereUniqueInput[]
    update?: BackupUpdateWithWhereUniqueWithoutServerInput | BackupUpdateWithWhereUniqueWithoutServerInput[]
    updateMany?: BackupUpdateManyWithWhereWithoutServerInput | BackupUpdateManyWithWhereWithoutServerInput[]
    deleteMany?: BackupScalarWhereInput | BackupScalarWhereInput[]
  }

  export type CollaboratorUpdateManyWithoutServerNestedInput = {
    create?: XOR<CollaboratorCreateWithoutServerInput, CollaboratorUncheckedCreateWithoutServerInput> | CollaboratorCreateWithoutServerInput[] | CollaboratorUncheckedCreateWithoutServerInput[]
    connectOrCreate?: CollaboratorCreateOrConnectWithoutServerInput | CollaboratorCreateOrConnectWithoutServerInput[]
    upsert?: CollaboratorUpsertWithWhereUniqueWithoutServerInput | CollaboratorUpsertWithWhereUniqueWithoutServerInput[]
    createMany?: CollaboratorCreateManyServerInputEnvelope
    set?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    disconnect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    delete?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    connect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    update?: CollaboratorUpdateWithWhereUniqueWithoutServerInput | CollaboratorUpdateWithWhereUniqueWithoutServerInput[]
    updateMany?: CollaboratorUpdateManyWithWhereWithoutServerInput | CollaboratorUpdateManyWithWhereWithoutServerInput[]
    deleteMany?: CollaboratorScalarWhereInput | CollaboratorScalarWhereInput[]
  }

  export type BackupUncheckedUpdateManyWithoutServerNestedInput = {
    create?: XOR<BackupCreateWithoutServerInput, BackupUncheckedCreateWithoutServerInput> | BackupCreateWithoutServerInput[] | BackupUncheckedCreateWithoutServerInput[]
    connectOrCreate?: BackupCreateOrConnectWithoutServerInput | BackupCreateOrConnectWithoutServerInput[]
    upsert?: BackupUpsertWithWhereUniqueWithoutServerInput | BackupUpsertWithWhereUniqueWithoutServerInput[]
    createMany?: BackupCreateManyServerInputEnvelope
    set?: BackupWhereUniqueInput | BackupWhereUniqueInput[]
    disconnect?: BackupWhereUniqueInput | BackupWhereUniqueInput[]
    delete?: BackupWhereUniqueInput | BackupWhereUniqueInput[]
    connect?: BackupWhereUniqueInput | BackupWhereUniqueInput[]
    update?: BackupUpdateWithWhereUniqueWithoutServerInput | BackupUpdateWithWhereUniqueWithoutServerInput[]
    updateMany?: BackupUpdateManyWithWhereWithoutServerInput | BackupUpdateManyWithWhereWithoutServerInput[]
    deleteMany?: BackupScalarWhereInput | BackupScalarWhereInput[]
  }

  export type CollaboratorUncheckedUpdateManyWithoutServerNestedInput = {
    create?: XOR<CollaboratorCreateWithoutServerInput, CollaboratorUncheckedCreateWithoutServerInput> | CollaboratorCreateWithoutServerInput[] | CollaboratorUncheckedCreateWithoutServerInput[]
    connectOrCreate?: CollaboratorCreateOrConnectWithoutServerInput | CollaboratorCreateOrConnectWithoutServerInput[]
    upsert?: CollaboratorUpsertWithWhereUniqueWithoutServerInput | CollaboratorUpsertWithWhereUniqueWithoutServerInput[]
    createMany?: CollaboratorCreateManyServerInputEnvelope
    set?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    disconnect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    delete?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    connect?: CollaboratorWhereUniqueInput | CollaboratorWhereUniqueInput[]
    update?: CollaboratorUpdateWithWhereUniqueWithoutServerInput | CollaboratorUpdateWithWhereUniqueWithoutServerInput[]
    updateMany?: CollaboratorUpdateManyWithWhereWithoutServerInput | CollaboratorUpdateManyWithWhereWithoutServerInput[]
    deleteMany?: CollaboratorScalarWhereInput | CollaboratorScalarWhereInput[]
  }

  export type UserCreateNestedOneWithoutArchivesInput = {
    create?: XOR<UserCreateWithoutArchivesInput, UserUncheckedCreateWithoutArchivesInput>
    connectOrCreate?: UserCreateOrConnectWithoutArchivesInput
    connect?: UserWhereUniqueInput
  }

  export type UserUpdateOneRequiredWithoutArchivesNestedInput = {
    create?: XOR<UserCreateWithoutArchivesInput, UserUncheckedCreateWithoutArchivesInput>
    connectOrCreate?: UserCreateOrConnectWithoutArchivesInput
    upsert?: UserUpsertWithoutArchivesInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutArchivesInput, UserUpdateWithoutArchivesInput>, UserUncheckedUpdateWithoutArchivesInput>
  }

  export type UserCreateNestedOneWithoutLogsInput = {
    create?: XOR<UserCreateWithoutLogsInput, UserUncheckedCreateWithoutLogsInput>
    connectOrCreate?: UserCreateOrConnectWithoutLogsInput
    connect?: UserWhereUniqueInput
  }

  export type UserUpdateOneRequiredWithoutLogsNestedInput = {
    create?: XOR<UserCreateWithoutLogsInput, UserUncheckedCreateWithoutLogsInput>
    connectOrCreate?: UserCreateOrConnectWithoutLogsInput
    upsert?: UserUpsertWithoutLogsInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutLogsInput, UserUpdateWithoutLogsInput>, UserUncheckedUpdateWithoutLogsInput>
  }

  export type ServerCreateNestedOneWithoutBackupsInput = {
    create?: XOR<ServerCreateWithoutBackupsInput, ServerUncheckedCreateWithoutBackupsInput>
    connectOrCreate?: ServerCreateOrConnectWithoutBackupsInput
    connect?: ServerWhereUniqueInput
  }

  export type ServerUpdateOneRequiredWithoutBackupsNestedInput = {
    create?: XOR<ServerCreateWithoutBackupsInput, ServerUncheckedCreateWithoutBackupsInput>
    connectOrCreate?: ServerCreateOrConnectWithoutBackupsInput
    upsert?: ServerUpsertWithoutBackupsInput
    connect?: ServerWhereUniqueInput
    update?: XOR<XOR<ServerUpdateToOneWithWhereWithoutBackupsInput, ServerUpdateWithoutBackupsInput>, ServerUncheckedUpdateWithoutBackupsInput>
  }

  export type ServerCreateNestedOneWithoutCollaboratorsInput = {
    create?: XOR<ServerCreateWithoutCollaboratorsInput, ServerUncheckedCreateWithoutCollaboratorsInput>
    connectOrCreate?: ServerCreateOrConnectWithoutCollaboratorsInput
    connect?: ServerWhereUniqueInput
  }

  export type UserCreateNestedOneWithoutCollaboratorAccessInput = {
    create?: XOR<UserCreateWithoutCollaboratorAccessInput, UserUncheckedCreateWithoutCollaboratorAccessInput>
    connectOrCreate?: UserCreateOrConnectWithoutCollaboratorAccessInput
    connect?: UserWhereUniqueInput
  }

  export type ServerUpdateOneRequiredWithoutCollaboratorsNestedInput = {
    create?: XOR<ServerCreateWithoutCollaboratorsInput, ServerUncheckedCreateWithoutCollaboratorsInput>
    connectOrCreate?: ServerCreateOrConnectWithoutCollaboratorsInput
    upsert?: ServerUpsertWithoutCollaboratorsInput
    connect?: ServerWhereUniqueInput
    update?: XOR<XOR<ServerUpdateToOneWithWhereWithoutCollaboratorsInput, ServerUpdateWithoutCollaboratorsInput>, ServerUncheckedUpdateWithoutCollaboratorsInput>
  }

  export type UserUpdateOneRequiredWithoutCollaboratorAccessNestedInput = {
    create?: XOR<UserCreateWithoutCollaboratorAccessInput, UserUncheckedCreateWithoutCollaboratorAccessInput>
    connectOrCreate?: UserCreateOrConnectWithoutCollaboratorAccessInput
    upsert?: UserUpsertWithoutCollaboratorAccessInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutCollaboratorAccessInput, UserUpdateWithoutCollaboratorAccessInput>, UserUncheckedUpdateWithoutCollaboratorAccessInput>
  }

  export type UserCreateNestedOneWithoutDefinitionsInput = {
    create?: XOR<UserCreateWithoutDefinitionsInput, UserUncheckedCreateWithoutDefinitionsInput>
    connectOrCreate?: UserCreateOrConnectWithoutDefinitionsInput
    connect?: UserWhereUniqueInput
  }

  export type ServerCreateNestedManyWithoutDefinitionInput = {
    create?: XOR<ServerCreateWithoutDefinitionInput, ServerUncheckedCreateWithoutDefinitionInput> | ServerCreateWithoutDefinitionInput[] | ServerUncheckedCreateWithoutDefinitionInput[]
    connectOrCreate?: ServerCreateOrConnectWithoutDefinitionInput | ServerCreateOrConnectWithoutDefinitionInput[]
    createMany?: ServerCreateManyDefinitionInputEnvelope
    connect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
  }

  export type ServerUncheckedCreateNestedManyWithoutDefinitionInput = {
    create?: XOR<ServerCreateWithoutDefinitionInput, ServerUncheckedCreateWithoutDefinitionInput> | ServerCreateWithoutDefinitionInput[] | ServerUncheckedCreateWithoutDefinitionInput[]
    connectOrCreate?: ServerCreateOrConnectWithoutDefinitionInput | ServerCreateOrConnectWithoutDefinitionInput[]
    createMany?: ServerCreateManyDefinitionInputEnvelope
    connect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
  }

  export type UserUpdateOneWithoutDefinitionsNestedInput = {
    create?: XOR<UserCreateWithoutDefinitionsInput, UserUncheckedCreateWithoutDefinitionsInput>
    connectOrCreate?: UserCreateOrConnectWithoutDefinitionsInput
    upsert?: UserUpsertWithoutDefinitionsInput
    disconnect?: UserWhereInput | boolean
    delete?: UserWhereInput | boolean
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutDefinitionsInput, UserUpdateWithoutDefinitionsInput>, UserUncheckedUpdateWithoutDefinitionsInput>
  }

  export type ServerUpdateManyWithoutDefinitionNestedInput = {
    create?: XOR<ServerCreateWithoutDefinitionInput, ServerUncheckedCreateWithoutDefinitionInput> | ServerCreateWithoutDefinitionInput[] | ServerUncheckedCreateWithoutDefinitionInput[]
    connectOrCreate?: ServerCreateOrConnectWithoutDefinitionInput | ServerCreateOrConnectWithoutDefinitionInput[]
    upsert?: ServerUpsertWithWhereUniqueWithoutDefinitionInput | ServerUpsertWithWhereUniqueWithoutDefinitionInput[]
    createMany?: ServerCreateManyDefinitionInputEnvelope
    set?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    disconnect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    delete?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    connect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    update?: ServerUpdateWithWhereUniqueWithoutDefinitionInput | ServerUpdateWithWhereUniqueWithoutDefinitionInput[]
    updateMany?: ServerUpdateManyWithWhereWithoutDefinitionInput | ServerUpdateManyWithWhereWithoutDefinitionInput[]
    deleteMany?: ServerScalarWhereInput | ServerScalarWhereInput[]
  }

  export type ServerUncheckedUpdateManyWithoutDefinitionNestedInput = {
    create?: XOR<ServerCreateWithoutDefinitionInput, ServerUncheckedCreateWithoutDefinitionInput> | ServerCreateWithoutDefinitionInput[] | ServerUncheckedCreateWithoutDefinitionInput[]
    connectOrCreate?: ServerCreateOrConnectWithoutDefinitionInput | ServerCreateOrConnectWithoutDefinitionInput[]
    upsert?: ServerUpsertWithWhereUniqueWithoutDefinitionInput | ServerUpsertWithWhereUniqueWithoutDefinitionInput[]
    createMany?: ServerCreateManyDefinitionInputEnvelope
    set?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    disconnect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    delete?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    connect?: ServerWhereUniqueInput | ServerWhereUniqueInput[]
    update?: ServerUpdateWithWhereUniqueWithoutDefinitionInput | ServerUpdateWithWhereUniqueWithoutDefinitionInput[]
    updateMany?: ServerUpdateManyWithWhereWithoutDefinitionInput | ServerUpdateManyWithWhereWithoutDefinitionInput[]
    deleteMany?: ServerScalarWhereInput | ServerScalarWhereInput[]
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedFloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedFloatFilter<$PrismaModel>
    _min?: NestedFloatFilter<$PrismaModel>
    _max?: NestedFloatFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | null
    notIn?: Date[] | string[] | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type GameDefinitionCreateWithoutOwnerInput = {
    id?: string
    slug: string
    displayName: string
    icon?: string
    color?: string
    description?: string
    recommendedRamGB?: number
    requiredDiskGB?: number
    isBuiltIn?: boolean
    installMethod: string
    spec: string
    createdAt?: Date | string
    updatedAt?: Date | string
    servers?: ServerCreateNestedManyWithoutDefinitionInput
  }

  export type GameDefinitionUncheckedCreateWithoutOwnerInput = {
    id?: string
    slug: string
    displayName: string
    icon?: string
    color?: string
    description?: string
    recommendedRamGB?: number
    requiredDiskGB?: number
    isBuiltIn?: boolean
    installMethod: string
    spec: string
    createdAt?: Date | string
    updatedAt?: Date | string
    servers?: ServerUncheckedCreateNestedManyWithoutDefinitionInput
  }

  export type GameDefinitionCreateOrConnectWithoutOwnerInput = {
    where: GameDefinitionWhereUniqueInput
    create: XOR<GameDefinitionCreateWithoutOwnerInput, GameDefinitionUncheckedCreateWithoutOwnerInput>
  }

  export type GameDefinitionCreateManyOwnerInputEnvelope = {
    data: GameDefinitionCreateManyOwnerInput | GameDefinitionCreateManyOwnerInput[]
  }

  export type SubscriptionCreateWithoutUserInput = {
    id?: string
    plan: string
    status: string
    activeSlots: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SubscriptionUncheckedCreateWithoutUserInput = {
    id?: string
    plan: string
    status: string
    activeSlots: number
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SubscriptionCreateOrConnectWithoutUserInput = {
    where: SubscriptionWhereUniqueInput
    create: XOR<SubscriptionCreateWithoutUserInput, SubscriptionUncheckedCreateWithoutUserInput>
  }

  export type ServerCreateWithoutUserInput = {
    id?: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
    definition?: GameDefinitionCreateNestedOneWithoutServersInput
    backups?: BackupCreateNestedManyWithoutServerInput
    collaborators?: CollaboratorCreateNestedManyWithoutServerInput
  }

  export type ServerUncheckedCreateWithoutUserInput = {
    id?: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    definitionId?: string | null
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
    backups?: BackupUncheckedCreateNestedManyWithoutServerInput
    collaborators?: CollaboratorUncheckedCreateNestedManyWithoutServerInput
  }

  export type ServerCreateOrConnectWithoutUserInput = {
    where: ServerWhereUniqueInput
    create: XOR<ServerCreateWithoutUserInput, ServerUncheckedCreateWithoutUserInput>
  }

  export type ServerCreateManyUserInputEnvelope = {
    data: ServerCreateManyUserInput | ServerCreateManyUserInput[]
  }

  export type ArchiveCreateWithoutUserInput = {
    id?: string
    serverName: string
    game: string
    saveSizeGB: number
    archivedAt?: Date | string
    createdAt?: Date | string
  }

  export type ArchiveUncheckedCreateWithoutUserInput = {
    id?: string
    serverName: string
    game: string
    saveSizeGB: number
    archivedAt?: Date | string
    createdAt?: Date | string
  }

  export type ArchiveCreateOrConnectWithoutUserInput = {
    where: ArchiveWhereUniqueInput
    create: XOR<ArchiveCreateWithoutUserInput, ArchiveUncheckedCreateWithoutUserInput>
  }

  export type ArchiveCreateManyUserInputEnvelope = {
    data: ArchiveCreateManyUserInput | ArchiveCreateManyUserInput[]
  }

  export type ActivityLogCreateWithoutUserInput = {
    id?: string
    action: string
    details: string
    createdAt?: Date | string
  }

  export type ActivityLogUncheckedCreateWithoutUserInput = {
    id?: string
    action: string
    details: string
    createdAt?: Date | string
  }

  export type ActivityLogCreateOrConnectWithoutUserInput = {
    where: ActivityLogWhereUniqueInput
    create: XOR<ActivityLogCreateWithoutUserInput, ActivityLogUncheckedCreateWithoutUserInput>
  }

  export type ActivityLogCreateManyUserInputEnvelope = {
    data: ActivityLogCreateManyUserInput | ActivityLogCreateManyUserInput[]
  }

  export type CollaboratorCreateWithoutUserInput = {
    id?: string
    role: string
    createdAt?: Date | string
    server: ServerCreateNestedOneWithoutCollaboratorsInput
  }

  export type CollaboratorUncheckedCreateWithoutUserInput = {
    id?: string
    serverId: string
    role: string
    createdAt?: Date | string
  }

  export type CollaboratorCreateOrConnectWithoutUserInput = {
    where: CollaboratorWhereUniqueInput
    create: XOR<CollaboratorCreateWithoutUserInput, CollaboratorUncheckedCreateWithoutUserInput>
  }

  export type CollaboratorCreateManyUserInputEnvelope = {
    data: CollaboratorCreateManyUserInput | CollaboratorCreateManyUserInput[]
  }

  export type GameDefinitionUpsertWithWhereUniqueWithoutOwnerInput = {
    where: GameDefinitionWhereUniqueInput
    update: XOR<GameDefinitionUpdateWithoutOwnerInput, GameDefinitionUncheckedUpdateWithoutOwnerInput>
    create: XOR<GameDefinitionCreateWithoutOwnerInput, GameDefinitionUncheckedCreateWithoutOwnerInput>
  }

  export type GameDefinitionUpdateWithWhereUniqueWithoutOwnerInput = {
    where: GameDefinitionWhereUniqueInput
    data: XOR<GameDefinitionUpdateWithoutOwnerInput, GameDefinitionUncheckedUpdateWithoutOwnerInput>
  }

  export type GameDefinitionUpdateManyWithWhereWithoutOwnerInput = {
    where: GameDefinitionScalarWhereInput
    data: XOR<GameDefinitionUpdateManyMutationInput, GameDefinitionUncheckedUpdateManyWithoutOwnerInput>
  }

  export type GameDefinitionScalarWhereInput = {
    AND?: GameDefinitionScalarWhereInput | GameDefinitionScalarWhereInput[]
    OR?: GameDefinitionScalarWhereInput[]
    NOT?: GameDefinitionScalarWhereInput | GameDefinitionScalarWhereInput[]
    id?: StringFilter<"GameDefinition"> | string
    slug?: StringFilter<"GameDefinition"> | string
    displayName?: StringFilter<"GameDefinition"> | string
    icon?: StringFilter<"GameDefinition"> | string
    color?: StringFilter<"GameDefinition"> | string
    description?: StringFilter<"GameDefinition"> | string
    recommendedRamGB?: FloatFilter<"GameDefinition"> | number
    requiredDiskGB?: FloatFilter<"GameDefinition"> | number
    ownerId?: StringNullableFilter<"GameDefinition"> | string | null
    isBuiltIn?: BoolFilter<"GameDefinition"> | boolean
    installMethod?: StringFilter<"GameDefinition"> | string
    spec?: StringFilter<"GameDefinition"> | string
    createdAt?: DateTimeFilter<"GameDefinition"> | Date | string
    updatedAt?: DateTimeFilter<"GameDefinition"> | Date | string
  }

  export type SubscriptionUpsertWithoutUserInput = {
    update: XOR<SubscriptionUpdateWithoutUserInput, SubscriptionUncheckedUpdateWithoutUserInput>
    create: XOR<SubscriptionCreateWithoutUserInput, SubscriptionUncheckedCreateWithoutUserInput>
    where?: SubscriptionWhereInput
  }

  export type SubscriptionUpdateToOneWithWhereWithoutUserInput = {
    where?: SubscriptionWhereInput
    data: XOR<SubscriptionUpdateWithoutUserInput, SubscriptionUncheckedUpdateWithoutUserInput>
  }

  export type SubscriptionUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    plan?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    activeSlots?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SubscriptionUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    plan?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    activeSlots?: IntFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ServerUpsertWithWhereUniqueWithoutUserInput = {
    where: ServerWhereUniqueInput
    update: XOR<ServerUpdateWithoutUserInput, ServerUncheckedUpdateWithoutUserInput>
    create: XOR<ServerCreateWithoutUserInput, ServerUncheckedCreateWithoutUserInput>
  }

  export type ServerUpdateWithWhereUniqueWithoutUserInput = {
    where: ServerWhereUniqueInput
    data: XOR<ServerUpdateWithoutUserInput, ServerUncheckedUpdateWithoutUserInput>
  }

  export type ServerUpdateManyWithWhereWithoutUserInput = {
    where: ServerScalarWhereInput
    data: XOR<ServerUpdateManyMutationInput, ServerUncheckedUpdateManyWithoutUserInput>
  }

  export type ServerScalarWhereInput = {
    AND?: ServerScalarWhereInput | ServerScalarWhereInput[]
    OR?: ServerScalarWhereInput[]
    NOT?: ServerScalarWhereInput | ServerScalarWhereInput[]
    id?: StringFilter<"Server"> | string
    userId?: StringFilter<"Server"> | string
    name?: StringFilter<"Server"> | string
    game?: StringFilter<"Server"> | string
    ramAllocation?: FloatFilter<"Server"> | number
    region?: StringFilter<"Server"> | string
    status?: StringFilter<"Server"> | string
    runnerType?: StringFilter<"Server"> | string
    localPath?: StringNullableFilter<"Server"> | string | null
    pid?: IntNullableFilter<"Server"> | number | null
    password?: StringNullableFilter<"Server"> | string | null
    enableUpnp?: BoolFilter<"Server"> | boolean
    ipAddress?: StringFilter<"Server"> | string
    port?: IntFilter<"Server"> | number
    definitionId?: StringNullableFilter<"Server"> | string | null
    paramValues?: StringNullableFilter<"Server"> | string | null
    cpuUsage?: FloatFilter<"Server"> | number
    memoryUsage?: FloatFilter<"Server"> | number
    createdAt?: DateTimeFilter<"Server"> | Date | string
    updatedAt?: DateTimeFilter<"Server"> | Date | string
    snapshotInterval?: IntFilter<"Server"> | number
    lastSnapshotAt?: DateTimeNullableFilter<"Server"> | Date | string | null
  }

  export type ArchiveUpsertWithWhereUniqueWithoutUserInput = {
    where: ArchiveWhereUniqueInput
    update: XOR<ArchiveUpdateWithoutUserInput, ArchiveUncheckedUpdateWithoutUserInput>
    create: XOR<ArchiveCreateWithoutUserInput, ArchiveUncheckedCreateWithoutUserInput>
  }

  export type ArchiveUpdateWithWhereUniqueWithoutUserInput = {
    where: ArchiveWhereUniqueInput
    data: XOR<ArchiveUpdateWithoutUserInput, ArchiveUncheckedUpdateWithoutUserInput>
  }

  export type ArchiveUpdateManyWithWhereWithoutUserInput = {
    where: ArchiveScalarWhereInput
    data: XOR<ArchiveUpdateManyMutationInput, ArchiveUncheckedUpdateManyWithoutUserInput>
  }

  export type ArchiveScalarWhereInput = {
    AND?: ArchiveScalarWhereInput | ArchiveScalarWhereInput[]
    OR?: ArchiveScalarWhereInput[]
    NOT?: ArchiveScalarWhereInput | ArchiveScalarWhereInput[]
    id?: StringFilter<"Archive"> | string
    userId?: StringFilter<"Archive"> | string
    serverName?: StringFilter<"Archive"> | string
    game?: StringFilter<"Archive"> | string
    saveSizeGB?: FloatFilter<"Archive"> | number
    archivedAt?: DateTimeFilter<"Archive"> | Date | string
    createdAt?: DateTimeFilter<"Archive"> | Date | string
  }

  export type ActivityLogUpsertWithWhereUniqueWithoutUserInput = {
    where: ActivityLogWhereUniqueInput
    update: XOR<ActivityLogUpdateWithoutUserInput, ActivityLogUncheckedUpdateWithoutUserInput>
    create: XOR<ActivityLogCreateWithoutUserInput, ActivityLogUncheckedCreateWithoutUserInput>
  }

  export type ActivityLogUpdateWithWhereUniqueWithoutUserInput = {
    where: ActivityLogWhereUniqueInput
    data: XOR<ActivityLogUpdateWithoutUserInput, ActivityLogUncheckedUpdateWithoutUserInput>
  }

  export type ActivityLogUpdateManyWithWhereWithoutUserInput = {
    where: ActivityLogScalarWhereInput
    data: XOR<ActivityLogUpdateManyMutationInput, ActivityLogUncheckedUpdateManyWithoutUserInput>
  }

  export type ActivityLogScalarWhereInput = {
    AND?: ActivityLogScalarWhereInput | ActivityLogScalarWhereInput[]
    OR?: ActivityLogScalarWhereInput[]
    NOT?: ActivityLogScalarWhereInput | ActivityLogScalarWhereInput[]
    id?: StringFilter<"ActivityLog"> | string
    userId?: StringFilter<"ActivityLog"> | string
    action?: StringFilter<"ActivityLog"> | string
    details?: StringFilter<"ActivityLog"> | string
    createdAt?: DateTimeFilter<"ActivityLog"> | Date | string
  }

  export type CollaboratorUpsertWithWhereUniqueWithoutUserInput = {
    where: CollaboratorWhereUniqueInput
    update: XOR<CollaboratorUpdateWithoutUserInput, CollaboratorUncheckedUpdateWithoutUserInput>
    create: XOR<CollaboratorCreateWithoutUserInput, CollaboratorUncheckedCreateWithoutUserInput>
  }

  export type CollaboratorUpdateWithWhereUniqueWithoutUserInput = {
    where: CollaboratorWhereUniqueInput
    data: XOR<CollaboratorUpdateWithoutUserInput, CollaboratorUncheckedUpdateWithoutUserInput>
  }

  export type CollaboratorUpdateManyWithWhereWithoutUserInput = {
    where: CollaboratorScalarWhereInput
    data: XOR<CollaboratorUpdateManyMutationInput, CollaboratorUncheckedUpdateManyWithoutUserInput>
  }

  export type CollaboratorScalarWhereInput = {
    AND?: CollaboratorScalarWhereInput | CollaboratorScalarWhereInput[]
    OR?: CollaboratorScalarWhereInput[]
    NOT?: CollaboratorScalarWhereInput | CollaboratorScalarWhereInput[]
    id?: StringFilter<"Collaborator"> | string
    serverId?: StringFilter<"Collaborator"> | string
    userId?: StringFilter<"Collaborator"> | string
    role?: StringFilter<"Collaborator"> | string
    createdAt?: DateTimeFilter<"Collaborator"> | Date | string
  }

  export type UserCreateWithoutSubscriptionInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionCreateNestedManyWithoutOwnerInput
    servers?: ServerCreateNestedManyWithoutUserInput
    archives?: ArchiveCreateNestedManyWithoutUserInput
    logs?: ActivityLogCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutSubscriptionInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionUncheckedCreateNestedManyWithoutOwnerInput
    servers?: ServerUncheckedCreateNestedManyWithoutUserInput
    archives?: ArchiveUncheckedCreateNestedManyWithoutUserInput
    logs?: ActivityLogUncheckedCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutSubscriptionInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutSubscriptionInput, UserUncheckedCreateWithoutSubscriptionInput>
  }

  export type UserUpsertWithoutSubscriptionInput = {
    update: XOR<UserUpdateWithoutSubscriptionInput, UserUncheckedUpdateWithoutSubscriptionInput>
    create: XOR<UserCreateWithoutSubscriptionInput, UserUncheckedCreateWithoutSubscriptionInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutSubscriptionInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutSubscriptionInput, UserUncheckedUpdateWithoutSubscriptionInput>
  }

  export type UserUpdateWithoutSubscriptionInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUpdateManyWithoutOwnerNestedInput
    servers?: ServerUpdateManyWithoutUserNestedInput
    archives?: ArchiveUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutSubscriptionInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUncheckedUpdateManyWithoutOwnerNestedInput
    servers?: ServerUncheckedUpdateManyWithoutUserNestedInput
    archives?: ArchiveUncheckedUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUncheckedUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserCreateWithoutServersInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionCreateNestedManyWithoutOwnerInput
    subscription?: SubscriptionCreateNestedOneWithoutUserInput
    archives?: ArchiveCreateNestedManyWithoutUserInput
    logs?: ActivityLogCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutServersInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionUncheckedCreateNestedManyWithoutOwnerInput
    subscription?: SubscriptionUncheckedCreateNestedOneWithoutUserInput
    archives?: ArchiveUncheckedCreateNestedManyWithoutUserInput
    logs?: ActivityLogUncheckedCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutServersInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutServersInput, UserUncheckedCreateWithoutServersInput>
  }

  export type GameDefinitionCreateWithoutServersInput = {
    id?: string
    slug: string
    displayName: string
    icon?: string
    color?: string
    description?: string
    recommendedRamGB?: number
    requiredDiskGB?: number
    isBuiltIn?: boolean
    installMethod: string
    spec: string
    createdAt?: Date | string
    updatedAt?: Date | string
    owner?: UserCreateNestedOneWithoutDefinitionsInput
  }

  export type GameDefinitionUncheckedCreateWithoutServersInput = {
    id?: string
    slug: string
    displayName: string
    icon?: string
    color?: string
    description?: string
    recommendedRamGB?: number
    requiredDiskGB?: number
    ownerId?: string | null
    isBuiltIn?: boolean
    installMethod: string
    spec: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type GameDefinitionCreateOrConnectWithoutServersInput = {
    where: GameDefinitionWhereUniqueInput
    create: XOR<GameDefinitionCreateWithoutServersInput, GameDefinitionUncheckedCreateWithoutServersInput>
  }

  export type BackupCreateWithoutServerInput = {
    id?: string
    userId: string
    name: string
    game: string
    filePath: string
    fileSizeMB: number
    backupType: string
    createdAt?: Date | string
  }

  export type BackupUncheckedCreateWithoutServerInput = {
    id?: string
    userId: string
    name: string
    game: string
    filePath: string
    fileSizeMB: number
    backupType: string
    createdAt?: Date | string
  }

  export type BackupCreateOrConnectWithoutServerInput = {
    where: BackupWhereUniqueInput
    create: XOR<BackupCreateWithoutServerInput, BackupUncheckedCreateWithoutServerInput>
  }

  export type BackupCreateManyServerInputEnvelope = {
    data: BackupCreateManyServerInput | BackupCreateManyServerInput[]
  }

  export type CollaboratorCreateWithoutServerInput = {
    id?: string
    role: string
    createdAt?: Date | string
    user: UserCreateNestedOneWithoutCollaboratorAccessInput
  }

  export type CollaboratorUncheckedCreateWithoutServerInput = {
    id?: string
    userId: string
    role: string
    createdAt?: Date | string
  }

  export type CollaboratorCreateOrConnectWithoutServerInput = {
    where: CollaboratorWhereUniqueInput
    create: XOR<CollaboratorCreateWithoutServerInput, CollaboratorUncheckedCreateWithoutServerInput>
  }

  export type CollaboratorCreateManyServerInputEnvelope = {
    data: CollaboratorCreateManyServerInput | CollaboratorCreateManyServerInput[]
  }

  export type UserUpsertWithoutServersInput = {
    update: XOR<UserUpdateWithoutServersInput, UserUncheckedUpdateWithoutServersInput>
    create: XOR<UserCreateWithoutServersInput, UserUncheckedCreateWithoutServersInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutServersInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutServersInput, UserUncheckedUpdateWithoutServersInput>
  }

  export type UserUpdateWithoutServersInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUpdateManyWithoutOwnerNestedInput
    subscription?: SubscriptionUpdateOneWithoutUserNestedInput
    archives?: ArchiveUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutServersInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUncheckedUpdateManyWithoutOwnerNestedInput
    subscription?: SubscriptionUncheckedUpdateOneWithoutUserNestedInput
    archives?: ArchiveUncheckedUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUncheckedUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUncheckedUpdateManyWithoutUserNestedInput
  }

  export type GameDefinitionUpsertWithoutServersInput = {
    update: XOR<GameDefinitionUpdateWithoutServersInput, GameDefinitionUncheckedUpdateWithoutServersInput>
    create: XOR<GameDefinitionCreateWithoutServersInput, GameDefinitionUncheckedCreateWithoutServersInput>
    where?: GameDefinitionWhereInput
  }

  export type GameDefinitionUpdateToOneWithWhereWithoutServersInput = {
    where?: GameDefinitionWhereInput
    data: XOR<GameDefinitionUpdateWithoutServersInput, GameDefinitionUncheckedUpdateWithoutServersInput>
  }

  export type GameDefinitionUpdateWithoutServersInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    icon?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    description?: StringFieldUpdateOperationsInput | string
    recommendedRamGB?: FloatFieldUpdateOperationsInput | number
    requiredDiskGB?: FloatFieldUpdateOperationsInput | number
    isBuiltIn?: BoolFieldUpdateOperationsInput | boolean
    installMethod?: StringFieldUpdateOperationsInput | string
    spec?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    owner?: UserUpdateOneWithoutDefinitionsNestedInput
  }

  export type GameDefinitionUncheckedUpdateWithoutServersInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    icon?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    description?: StringFieldUpdateOperationsInput | string
    recommendedRamGB?: FloatFieldUpdateOperationsInput | number
    requiredDiskGB?: FloatFieldUpdateOperationsInput | number
    ownerId?: NullableStringFieldUpdateOperationsInput | string | null
    isBuiltIn?: BoolFieldUpdateOperationsInput | boolean
    installMethod?: StringFieldUpdateOperationsInput | string
    spec?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BackupUpsertWithWhereUniqueWithoutServerInput = {
    where: BackupWhereUniqueInput
    update: XOR<BackupUpdateWithoutServerInput, BackupUncheckedUpdateWithoutServerInput>
    create: XOR<BackupCreateWithoutServerInput, BackupUncheckedCreateWithoutServerInput>
  }

  export type BackupUpdateWithWhereUniqueWithoutServerInput = {
    where: BackupWhereUniqueInput
    data: XOR<BackupUpdateWithoutServerInput, BackupUncheckedUpdateWithoutServerInput>
  }

  export type BackupUpdateManyWithWhereWithoutServerInput = {
    where: BackupScalarWhereInput
    data: XOR<BackupUpdateManyMutationInput, BackupUncheckedUpdateManyWithoutServerInput>
  }

  export type BackupScalarWhereInput = {
    AND?: BackupScalarWhereInput | BackupScalarWhereInput[]
    OR?: BackupScalarWhereInput[]
    NOT?: BackupScalarWhereInput | BackupScalarWhereInput[]
    id?: StringFilter<"Backup"> | string
    serverId?: StringFilter<"Backup"> | string
    userId?: StringFilter<"Backup"> | string
    name?: StringFilter<"Backup"> | string
    game?: StringFilter<"Backup"> | string
    filePath?: StringFilter<"Backup"> | string
    fileSizeMB?: FloatFilter<"Backup"> | number
    backupType?: StringFilter<"Backup"> | string
    createdAt?: DateTimeFilter<"Backup"> | Date | string
  }

  export type CollaboratorUpsertWithWhereUniqueWithoutServerInput = {
    where: CollaboratorWhereUniqueInput
    update: XOR<CollaboratorUpdateWithoutServerInput, CollaboratorUncheckedUpdateWithoutServerInput>
    create: XOR<CollaboratorCreateWithoutServerInput, CollaboratorUncheckedCreateWithoutServerInput>
  }

  export type CollaboratorUpdateWithWhereUniqueWithoutServerInput = {
    where: CollaboratorWhereUniqueInput
    data: XOR<CollaboratorUpdateWithoutServerInput, CollaboratorUncheckedUpdateWithoutServerInput>
  }

  export type CollaboratorUpdateManyWithWhereWithoutServerInput = {
    where: CollaboratorScalarWhereInput
    data: XOR<CollaboratorUpdateManyMutationInput, CollaboratorUncheckedUpdateManyWithoutServerInput>
  }

  export type UserCreateWithoutArchivesInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionCreateNestedManyWithoutOwnerInput
    subscription?: SubscriptionCreateNestedOneWithoutUserInput
    servers?: ServerCreateNestedManyWithoutUserInput
    logs?: ActivityLogCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutArchivesInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionUncheckedCreateNestedManyWithoutOwnerInput
    subscription?: SubscriptionUncheckedCreateNestedOneWithoutUserInput
    servers?: ServerUncheckedCreateNestedManyWithoutUserInput
    logs?: ActivityLogUncheckedCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutArchivesInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutArchivesInput, UserUncheckedCreateWithoutArchivesInput>
  }

  export type UserUpsertWithoutArchivesInput = {
    update: XOR<UserUpdateWithoutArchivesInput, UserUncheckedUpdateWithoutArchivesInput>
    create: XOR<UserCreateWithoutArchivesInput, UserUncheckedCreateWithoutArchivesInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutArchivesInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutArchivesInput, UserUncheckedUpdateWithoutArchivesInput>
  }

  export type UserUpdateWithoutArchivesInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUpdateManyWithoutOwnerNestedInput
    subscription?: SubscriptionUpdateOneWithoutUserNestedInput
    servers?: ServerUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutArchivesInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUncheckedUpdateManyWithoutOwnerNestedInput
    subscription?: SubscriptionUncheckedUpdateOneWithoutUserNestedInput
    servers?: ServerUncheckedUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUncheckedUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserCreateWithoutLogsInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionCreateNestedManyWithoutOwnerInput
    subscription?: SubscriptionCreateNestedOneWithoutUserInput
    servers?: ServerCreateNestedManyWithoutUserInput
    archives?: ArchiveCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutLogsInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionUncheckedCreateNestedManyWithoutOwnerInput
    subscription?: SubscriptionUncheckedCreateNestedOneWithoutUserInput
    servers?: ServerUncheckedCreateNestedManyWithoutUserInput
    archives?: ArchiveUncheckedCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutLogsInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutLogsInput, UserUncheckedCreateWithoutLogsInput>
  }

  export type UserUpsertWithoutLogsInput = {
    update: XOR<UserUpdateWithoutLogsInput, UserUncheckedUpdateWithoutLogsInput>
    create: XOR<UserCreateWithoutLogsInput, UserUncheckedCreateWithoutLogsInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutLogsInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutLogsInput, UserUncheckedUpdateWithoutLogsInput>
  }

  export type UserUpdateWithoutLogsInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUpdateManyWithoutOwnerNestedInput
    subscription?: SubscriptionUpdateOneWithoutUserNestedInput
    servers?: ServerUpdateManyWithoutUserNestedInput
    archives?: ArchiveUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutLogsInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUncheckedUpdateManyWithoutOwnerNestedInput
    subscription?: SubscriptionUncheckedUpdateOneWithoutUserNestedInput
    servers?: ServerUncheckedUpdateManyWithoutUserNestedInput
    archives?: ArchiveUncheckedUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUncheckedUpdateManyWithoutUserNestedInput
  }

  export type ServerCreateWithoutBackupsInput = {
    id?: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
    user: UserCreateNestedOneWithoutServersInput
    definition?: GameDefinitionCreateNestedOneWithoutServersInput
    collaborators?: CollaboratorCreateNestedManyWithoutServerInput
  }

  export type ServerUncheckedCreateWithoutBackupsInput = {
    id?: string
    userId: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    definitionId?: string | null
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
    collaborators?: CollaboratorUncheckedCreateNestedManyWithoutServerInput
  }

  export type ServerCreateOrConnectWithoutBackupsInput = {
    where: ServerWhereUniqueInput
    create: XOR<ServerCreateWithoutBackupsInput, ServerUncheckedCreateWithoutBackupsInput>
  }

  export type ServerUpsertWithoutBackupsInput = {
    update: XOR<ServerUpdateWithoutBackupsInput, ServerUncheckedUpdateWithoutBackupsInput>
    create: XOR<ServerCreateWithoutBackupsInput, ServerUncheckedCreateWithoutBackupsInput>
    where?: ServerWhereInput
  }

  export type ServerUpdateToOneWithWhereWithoutBackupsInput = {
    where?: ServerWhereInput
    data: XOR<ServerUpdateWithoutBackupsInput, ServerUncheckedUpdateWithoutBackupsInput>
  }

  export type ServerUpdateWithoutBackupsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    user?: UserUpdateOneRequiredWithoutServersNestedInput
    definition?: GameDefinitionUpdateOneWithoutServersNestedInput
    collaborators?: CollaboratorUpdateManyWithoutServerNestedInput
  }

  export type ServerUncheckedUpdateWithoutBackupsInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    definitionId?: NullableStringFieldUpdateOperationsInput | string | null
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    collaborators?: CollaboratorUncheckedUpdateManyWithoutServerNestedInput
  }

  export type ServerCreateWithoutCollaboratorsInput = {
    id?: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
    user: UserCreateNestedOneWithoutServersInput
    definition?: GameDefinitionCreateNestedOneWithoutServersInput
    backups?: BackupCreateNestedManyWithoutServerInput
  }

  export type ServerUncheckedCreateWithoutCollaboratorsInput = {
    id?: string
    userId: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    definitionId?: string | null
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
    backups?: BackupUncheckedCreateNestedManyWithoutServerInput
  }

  export type ServerCreateOrConnectWithoutCollaboratorsInput = {
    where: ServerWhereUniqueInput
    create: XOR<ServerCreateWithoutCollaboratorsInput, ServerUncheckedCreateWithoutCollaboratorsInput>
  }

  export type UserCreateWithoutCollaboratorAccessInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionCreateNestedManyWithoutOwnerInput
    subscription?: SubscriptionCreateNestedOneWithoutUserInput
    servers?: ServerCreateNestedManyWithoutUserInput
    archives?: ArchiveCreateNestedManyWithoutUserInput
    logs?: ActivityLogCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutCollaboratorAccessInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    definitions?: GameDefinitionUncheckedCreateNestedManyWithoutOwnerInput
    subscription?: SubscriptionUncheckedCreateNestedOneWithoutUserInput
    servers?: ServerUncheckedCreateNestedManyWithoutUserInput
    archives?: ArchiveUncheckedCreateNestedManyWithoutUserInput
    logs?: ActivityLogUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutCollaboratorAccessInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutCollaboratorAccessInput, UserUncheckedCreateWithoutCollaboratorAccessInput>
  }

  export type ServerUpsertWithoutCollaboratorsInput = {
    update: XOR<ServerUpdateWithoutCollaboratorsInput, ServerUncheckedUpdateWithoutCollaboratorsInput>
    create: XOR<ServerCreateWithoutCollaboratorsInput, ServerUncheckedCreateWithoutCollaboratorsInput>
    where?: ServerWhereInput
  }

  export type ServerUpdateToOneWithWhereWithoutCollaboratorsInput = {
    where?: ServerWhereInput
    data: XOR<ServerUpdateWithoutCollaboratorsInput, ServerUncheckedUpdateWithoutCollaboratorsInput>
  }

  export type ServerUpdateWithoutCollaboratorsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    user?: UserUpdateOneRequiredWithoutServersNestedInput
    definition?: GameDefinitionUpdateOneWithoutServersNestedInput
    backups?: BackupUpdateManyWithoutServerNestedInput
  }

  export type ServerUncheckedUpdateWithoutCollaboratorsInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    definitionId?: NullableStringFieldUpdateOperationsInput | string | null
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    backups?: BackupUncheckedUpdateManyWithoutServerNestedInput
  }

  export type UserUpsertWithoutCollaboratorAccessInput = {
    update: XOR<UserUpdateWithoutCollaboratorAccessInput, UserUncheckedUpdateWithoutCollaboratorAccessInput>
    create: XOR<UserCreateWithoutCollaboratorAccessInput, UserUncheckedCreateWithoutCollaboratorAccessInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutCollaboratorAccessInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutCollaboratorAccessInput, UserUncheckedUpdateWithoutCollaboratorAccessInput>
  }

  export type UserUpdateWithoutCollaboratorAccessInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUpdateManyWithoutOwnerNestedInput
    subscription?: SubscriptionUpdateOneWithoutUserNestedInput
    servers?: ServerUpdateManyWithoutUserNestedInput
    archives?: ArchiveUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutCollaboratorAccessInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    definitions?: GameDefinitionUncheckedUpdateManyWithoutOwnerNestedInput
    subscription?: SubscriptionUncheckedUpdateOneWithoutUserNestedInput
    servers?: ServerUncheckedUpdateManyWithoutUserNestedInput
    archives?: ArchiveUncheckedUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUncheckedUpdateManyWithoutUserNestedInput
  }

  export type UserCreateWithoutDefinitionsInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    subscription?: SubscriptionCreateNestedOneWithoutUserInput
    servers?: ServerCreateNestedManyWithoutUserInput
    archives?: ArchiveCreateNestedManyWithoutUserInput
    logs?: ActivityLogCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorCreateNestedManyWithoutUserInput
  }

  export type UserUncheckedCreateWithoutDefinitionsInput = {
    id?: string
    email: string
    passwordHash: string
    name: string
    createdAt?: Date | string
    updatedAt?: Date | string
    role?: string
    subscription?: SubscriptionUncheckedCreateNestedOneWithoutUserInput
    servers?: ServerUncheckedCreateNestedManyWithoutUserInput
    archives?: ArchiveUncheckedCreateNestedManyWithoutUserInput
    logs?: ActivityLogUncheckedCreateNestedManyWithoutUserInput
    collaboratorAccess?: CollaboratorUncheckedCreateNestedManyWithoutUserInput
  }

  export type UserCreateOrConnectWithoutDefinitionsInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutDefinitionsInput, UserUncheckedCreateWithoutDefinitionsInput>
  }

  export type ServerCreateWithoutDefinitionInput = {
    id?: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
    user: UserCreateNestedOneWithoutServersInput
    backups?: BackupCreateNestedManyWithoutServerInput
    collaborators?: CollaboratorCreateNestedManyWithoutServerInput
  }

  export type ServerUncheckedCreateWithoutDefinitionInput = {
    id?: string
    userId: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
    backups?: BackupUncheckedCreateNestedManyWithoutServerInput
    collaborators?: CollaboratorUncheckedCreateNestedManyWithoutServerInput
  }

  export type ServerCreateOrConnectWithoutDefinitionInput = {
    where: ServerWhereUniqueInput
    create: XOR<ServerCreateWithoutDefinitionInput, ServerUncheckedCreateWithoutDefinitionInput>
  }

  export type ServerCreateManyDefinitionInputEnvelope = {
    data: ServerCreateManyDefinitionInput | ServerCreateManyDefinitionInput[]
  }

  export type UserUpsertWithoutDefinitionsInput = {
    update: XOR<UserUpdateWithoutDefinitionsInput, UserUncheckedUpdateWithoutDefinitionsInput>
    create: XOR<UserCreateWithoutDefinitionsInput, UserUncheckedCreateWithoutDefinitionsInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutDefinitionsInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutDefinitionsInput, UserUncheckedUpdateWithoutDefinitionsInput>
  }

  export type UserUpdateWithoutDefinitionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    subscription?: SubscriptionUpdateOneWithoutUserNestedInput
    servers?: ServerUpdateManyWithoutUserNestedInput
    archives?: ArchiveUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUpdateManyWithoutUserNestedInput
  }

  export type UserUncheckedUpdateWithoutDefinitionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    passwordHash?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: StringFieldUpdateOperationsInput | string
    subscription?: SubscriptionUncheckedUpdateOneWithoutUserNestedInput
    servers?: ServerUncheckedUpdateManyWithoutUserNestedInput
    archives?: ArchiveUncheckedUpdateManyWithoutUserNestedInput
    logs?: ActivityLogUncheckedUpdateManyWithoutUserNestedInput
    collaboratorAccess?: CollaboratorUncheckedUpdateManyWithoutUserNestedInput
  }

  export type ServerUpsertWithWhereUniqueWithoutDefinitionInput = {
    where: ServerWhereUniqueInput
    update: XOR<ServerUpdateWithoutDefinitionInput, ServerUncheckedUpdateWithoutDefinitionInput>
    create: XOR<ServerCreateWithoutDefinitionInput, ServerUncheckedCreateWithoutDefinitionInput>
  }

  export type ServerUpdateWithWhereUniqueWithoutDefinitionInput = {
    where: ServerWhereUniqueInput
    data: XOR<ServerUpdateWithoutDefinitionInput, ServerUncheckedUpdateWithoutDefinitionInput>
  }

  export type ServerUpdateManyWithWhereWithoutDefinitionInput = {
    where: ServerScalarWhereInput
    data: XOR<ServerUpdateManyMutationInput, ServerUncheckedUpdateManyWithoutDefinitionInput>
  }

  export type GameDefinitionCreateManyOwnerInput = {
    id?: string
    slug: string
    displayName: string
    icon?: string
    color?: string
    description?: string
    recommendedRamGB?: number
    requiredDiskGB?: number
    isBuiltIn?: boolean
    installMethod: string
    spec: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ServerCreateManyUserInput = {
    id?: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    definitionId?: string | null
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
  }

  export type ArchiveCreateManyUserInput = {
    id?: string
    serverName: string
    game: string
    saveSizeGB: number
    archivedAt?: Date | string
    createdAt?: Date | string
  }

  export type ActivityLogCreateManyUserInput = {
    id?: string
    action: string
    details: string
    createdAt?: Date | string
  }

  export type CollaboratorCreateManyUserInput = {
    id?: string
    serverId: string
    role: string
    createdAt?: Date | string
  }

  export type GameDefinitionUpdateWithoutOwnerInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    icon?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    description?: StringFieldUpdateOperationsInput | string
    recommendedRamGB?: FloatFieldUpdateOperationsInput | number
    requiredDiskGB?: FloatFieldUpdateOperationsInput | number
    isBuiltIn?: BoolFieldUpdateOperationsInput | boolean
    installMethod?: StringFieldUpdateOperationsInput | string
    spec?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    servers?: ServerUpdateManyWithoutDefinitionNestedInput
  }

  export type GameDefinitionUncheckedUpdateWithoutOwnerInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    icon?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    description?: StringFieldUpdateOperationsInput | string
    recommendedRamGB?: FloatFieldUpdateOperationsInput | number
    requiredDiskGB?: FloatFieldUpdateOperationsInput | number
    isBuiltIn?: BoolFieldUpdateOperationsInput | boolean
    installMethod?: StringFieldUpdateOperationsInput | string
    spec?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    servers?: ServerUncheckedUpdateManyWithoutDefinitionNestedInput
  }

  export type GameDefinitionUncheckedUpdateManyWithoutOwnerInput = {
    id?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    displayName?: StringFieldUpdateOperationsInput | string
    icon?: StringFieldUpdateOperationsInput | string
    color?: StringFieldUpdateOperationsInput | string
    description?: StringFieldUpdateOperationsInput | string
    recommendedRamGB?: FloatFieldUpdateOperationsInput | number
    requiredDiskGB?: FloatFieldUpdateOperationsInput | number
    isBuiltIn?: BoolFieldUpdateOperationsInput | boolean
    installMethod?: StringFieldUpdateOperationsInput | string
    spec?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ServerUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    definition?: GameDefinitionUpdateOneWithoutServersNestedInput
    backups?: BackupUpdateManyWithoutServerNestedInput
    collaborators?: CollaboratorUpdateManyWithoutServerNestedInput
  }

  export type ServerUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    definitionId?: NullableStringFieldUpdateOperationsInput | string | null
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    backups?: BackupUncheckedUpdateManyWithoutServerNestedInput
    collaborators?: CollaboratorUncheckedUpdateManyWithoutServerNestedInput
  }

  export type ServerUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    definitionId?: NullableStringFieldUpdateOperationsInput | string | null
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ArchiveUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    serverName?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    saveSizeGB?: FloatFieldUpdateOperationsInput | number
    archivedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ArchiveUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    serverName?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    saveSizeGB?: FloatFieldUpdateOperationsInput | number
    archivedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ArchiveUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    serverName?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    saveSizeGB?: FloatFieldUpdateOperationsInput | number
    archivedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ActivityLogUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    details?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ActivityLogUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    details?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ActivityLogUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    action?: StringFieldUpdateOperationsInput | string
    details?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CollaboratorUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    server?: ServerUpdateOneRequiredWithoutCollaboratorsNestedInput
  }

  export type CollaboratorUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    serverId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CollaboratorUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    serverId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BackupCreateManyServerInput = {
    id?: string
    userId: string
    name: string
    game: string
    filePath: string
    fileSizeMB: number
    backupType: string
    createdAt?: Date | string
  }

  export type CollaboratorCreateManyServerInput = {
    id?: string
    userId: string
    role: string
    createdAt?: Date | string
  }

  export type BackupUpdateWithoutServerInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSizeMB?: FloatFieldUpdateOperationsInput | number
    backupType?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BackupUncheckedUpdateWithoutServerInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSizeMB?: FloatFieldUpdateOperationsInput | number
    backupType?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type BackupUncheckedUpdateManyWithoutServerInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    fileSizeMB?: FloatFieldUpdateOperationsInput | number
    backupType?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CollaboratorUpdateWithoutServerInput = {
    id?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutCollaboratorAccessNestedInput
  }

  export type CollaboratorUncheckedUpdateWithoutServerInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CollaboratorUncheckedUpdateManyWithoutServerInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    role?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ServerCreateManyDefinitionInput = {
    id?: string
    userId: string
    name: string
    game: string
    ramAllocation: number
    region: string
    status: string
    runnerType?: string
    localPath?: string | null
    pid?: number | null
    password?: string | null
    enableUpnp?: boolean
    ipAddress: string
    port: number
    paramValues?: string | null
    cpuUsage?: number
    memoryUsage?: number
    createdAt?: Date | string
    updatedAt?: Date | string
    snapshotInterval?: number
    lastSnapshotAt?: Date | string | null
  }

  export type ServerUpdateWithoutDefinitionInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    user?: UserUpdateOneRequiredWithoutServersNestedInput
    backups?: BackupUpdateManyWithoutServerNestedInput
    collaborators?: CollaboratorUpdateManyWithoutServerNestedInput
  }

  export type ServerUncheckedUpdateWithoutDefinitionInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    backups?: BackupUncheckedUpdateManyWithoutServerNestedInput
    collaborators?: CollaboratorUncheckedUpdateManyWithoutServerNestedInput
  }

  export type ServerUncheckedUpdateManyWithoutDefinitionInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    game?: StringFieldUpdateOperationsInput | string
    ramAllocation?: FloatFieldUpdateOperationsInput | number
    region?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    runnerType?: StringFieldUpdateOperationsInput | string
    localPath?: NullableStringFieldUpdateOperationsInput | string | null
    pid?: NullableIntFieldUpdateOperationsInput | number | null
    password?: NullableStringFieldUpdateOperationsInput | string | null
    enableUpnp?: BoolFieldUpdateOperationsInput | boolean
    ipAddress?: StringFieldUpdateOperationsInput | string
    port?: IntFieldUpdateOperationsInput | number
    paramValues?: NullableStringFieldUpdateOperationsInput | string | null
    cpuUsage?: FloatFieldUpdateOperationsInput | number
    memoryUsage?: FloatFieldUpdateOperationsInput | number
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    snapshotInterval?: IntFieldUpdateOperationsInput | number
    lastSnapshotAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }



  /**
   * Aliases for legacy arg types
   */
    /**
     * @deprecated Use UserCountOutputTypeDefaultArgs instead
     */
    export type UserCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = UserCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use ServerCountOutputTypeDefaultArgs instead
     */
    export type ServerCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = ServerCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use GameDefinitionCountOutputTypeDefaultArgs instead
     */
    export type GameDefinitionCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = GameDefinitionCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use UserDefaultArgs instead
     */
    export type UserArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = UserDefaultArgs<ExtArgs>
    /**
     * @deprecated Use SubscriptionDefaultArgs instead
     */
    export type SubscriptionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = SubscriptionDefaultArgs<ExtArgs>
    /**
     * @deprecated Use ServerDefaultArgs instead
     */
    export type ServerArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = ServerDefaultArgs<ExtArgs>
    /**
     * @deprecated Use ArchiveDefaultArgs instead
     */
    export type ArchiveArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = ArchiveDefaultArgs<ExtArgs>
    /**
     * @deprecated Use ActivityLogDefaultArgs instead
     */
    export type ActivityLogArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = ActivityLogDefaultArgs<ExtArgs>
    /**
     * @deprecated Use BackupDefaultArgs instead
     */
    export type BackupArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = BackupDefaultArgs<ExtArgs>
    /**
     * @deprecated Use CollaboratorDefaultArgs instead
     */
    export type CollaboratorArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = CollaboratorDefaultArgs<ExtArgs>
    /**
     * @deprecated Use GameDefinitionDefaultArgs instead
     */
    export type GameDefinitionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = GameDefinitionDefaultArgs<ExtArgs>

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}