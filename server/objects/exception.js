function Exception(code, message, fileName, lineNumber) {    
    const instance = new Error(message, fileName, lineNumber);
    instance.code = code;

    Object.setPrototypeOf(instance, Object.getPrototypeOf(this));
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(instance, Exception);
    }

    return instance;
};

Exception.prototype = Object.create(Error.prototype, {
    constructor: {
      value: Error,
      enumerable: false,
      writable: true,
      configurable: true
    }
});
  
if (Object.setPrototypeOf){
    Object.setPrototypeOf(Exception, Error);
} else {
    Exception.__proto__ = Error;
}

module.exports = Exception;