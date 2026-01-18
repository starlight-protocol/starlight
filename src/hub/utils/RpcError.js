
class RpcError extends Error {
    constructor(code, message, data) {
        super(message);
        this.code = code;
        this.data = data;
    }

    static invalidRequest(data) {
        return new RpcError(-32600, 'Invalid Request', data);
    }

    static methodNotFound(data) {
        return new RpcError(-32601, 'Method not found', data);
    }

    static invalidParams(data) {
        return new RpcError(-32602, 'Invalid params', data);
    }

    toJSON() {
        return {
            code: this.code,
            message: this.message,
            data: this.data
        };
    }
}

module.exports = { RpcError };
