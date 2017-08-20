const handlebars = require('handlebars');

module.exports = function(config, options) {
  let name = config.name;
  let processedName = name && name.split(" ")[0].toLowerCase().trim();
  let content = options.fn(this);
  return (handlebars.compile(content, {noEscape: true})(
    {
      name,
      processedName
    }
  ));
}
