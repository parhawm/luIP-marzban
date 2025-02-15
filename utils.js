const fs = require("fs");
const { spawn } = require("child_process");
// const { Api } = require("./config");
// const api = new Api();

function banIP(ip, email) {
  const scriptPath = "./ipban.sh";
  const args = [
    scriptPath,
    ip,
    `${process.env.BAN_TIME}`,
    `${process.env.SSH_PORT}`,
  ];

  const childProcess = spawn("bash", args);

  childProcess.on("close", (code) => {
    if (code === 0) {
      if (process.env.TG_ENABLE === "true")
        globalThis.bot.api.sendMessage(
          process.env.TG_ADMIN,
          `${email}: IP ${ip} banned successfully.
Duration: ${process.env.BAN_TIME} minutes
          `,
        );

      console.log(`IP ${ip} banned successfully.`);
    } else {
      console.error(`Failed to ban IP ${ip}.`);
    }
  });
}

class User {
  /**
   * @param {string} data Raw websocket data
   * @returns {NewUserIpType[]}
   */
  GetNewUserIP = (data) => {
    let lines = data
      .split(/\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/g)
      .map((item) => item.trim())
      .filter((item) => item);

    lines = lines.filter((item) => item.includes("accepted"));

    if (!lines.length === 0) return [];

    const getIp = (params) => {
      const chunks = params.split(":");

      if (/[a-zA-Z]/g.test(params)) chunks.shift();

      return { ip: chunks[0], port: chunks[1] };
    };

    lines = lines.map((item) => ({
      ...getIp(item.split(" ")[0]),
      email: item.split(" ").slice(-1)[0].replace(/\d\./g, ""),
    }));

    return lines.reduce((prev, curr) => {
      const index = prev.findIndex((item) => item.ip === curr.ip);
      if (index !== -1) prev[index] = curr;
      else prev.push(curr);

      return prev;
    }, []);
  };

  /**
   *
   * @param {string} data Raw websocket data
   * @returns {string}
   */
  GetEmail = (data) => {
    let returnData = "";

    const chunks = data.split(" ");

    if (!chunks.includes("email:")) return returnData;

    const index = chunks.findIndex((item) => item === "email:");

    const email = chunks[index + 1].split(".")[1].split("\n")[0];
		console.log(email);

    return email;
  };

  /**
   *
   * @param {string} data Raw websocket data
   * @returns {number}
   */
  GetConnectionId(data) {
    const chunks = data.split(" ");

    const index = chunks.findIndex((item) => item === "[Info]");

    if (index === -1) return 0;

    const d = chunks[index + 1];

    return JSON.parse(d)[0];
  }

  /**
   *
   * @param {string} data Raw websocket data
   * @returns {number}
   */
  Closed = (data) => {
    const chunks = data.split(" ");

    const ends =
      chunks.includes("connection") &&
      chunks.includes("ends") &&
      chunks.includes("websocket:");

    if (!ends) return 0;

    return this.GetConnectionId(data);
  };
}

class Server {
  /**
   * @param {string} address address with port. Like: example.com:443
   * @param {boolean} api Return address with api
   * @returns {string}
   */
  CleanAddress(address, api = true, showHttp = true) {
    const [ADDRESS, port] = address.split(":");

    let _address = address;

    if (+port === 443) _address = ADDRESS;

    if (showHttp)
      if (process.env.SSL == "true") _address = `https://${_address}`;
      else _address = `http://${_address}`;

    if (api) _address += "/api";

    return _address;
  }
}

class File {
  constructor() {}

  ForceExistsFile(path, data = undefined) {
    if (!fs.existsSync(path)) fs.writeFileSync(path, data);

    return;
  }

  GetJsonFile(path) {
    this.ForceExistsFile(path);

    return JSON.parse(fs.readFileSync(path));
  }

  GetCsvFile(path) {
    this.ForceExistsFile(path, "");

    return fs.readFileSync(path);
  }
}

/**
 * @description IP Guard
 */
class IPGuard {
  constructor(banDB) {
    this.banDB = banDB;
  }

  /**
   *
   * @param {IPSDataType} record A user's record includes email, ips array
   * @param {function[]} callback Return function to allow ip usage
   *
   * @returns {void | Promise<Function>}
   */
  async use(api, ip, ...callback) {
    const data = await callback[0]();

    if (!data) return await callback[1]();

    const indexOfIp = data.ips.findIndex((item) => item.ip === `${ip}`);

    const users = new File().GetJsonFile("users.json");
    let usersCsv = new File().GetCsvFile("users.csv").toString();

    if (usersCsv.trim()) {
      usersCsv = usersCsv.split("\r\n").map((item) => item.split(","));
    }

    if (usersCsv && usersCsv.some((item) => item[0] === data.email) === false)
      usersCsv = null;

    let userCsv = null;
    if (usersCsv.trim())
      userCsv = usersCsv.filter((item) => item[0] === data.email)[0] || null;

    const user = users.filter((item) => item[0] === data.email)[0] || null;

    const maxAllowConnection = userCsv
      ? +userCsv[1]
      : user
      ? +user[1]
      : +process.env.MAX_ALLOW_USERS;

    const limited = data.ips.length > maxAllowConnection;

    // Remove last user from db
    if (indexOfIp !== -1 && limited) {
      return callback[2]();
    }

    //
    if (data.ips.length >= maxAllowConnection && indexOfIp === -1) {
      // this.ban({ ip, email: data.email });
      await this.deactivateUser({ api: api, email: data.email });
      return;
    }

    return await callback[1]();
  }

  /**
   * @param {BanIpConfigAddType} params
   */
  async deactivateUser(params) {
    // banIP(`${params.ip}`, params.email);
    // console.log("ban", params)a
		email = params.email.replace(/^\d+/, '');
    params.api.create();
    await params.api.token();
    await params.api.deactivateUser(email);
  
  if (process.env.TG_ENABLE === "true")
      globalThis.bot.api.sendMessage(
          process.env.TG_ADMIN,
          `user ${email} disabled successfully.`,
        );
  }
}

module.exports = { User, Server, File, IPGuard };
