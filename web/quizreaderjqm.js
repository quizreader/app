/*
 This file is part of QuizReader.

 QuizReader is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 QuizReader is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with QuizReader.  If not, see <http://www.gnu.org/licenses/>.
 */

var qr = {
	// data access
	dao : null,
	// current language
	language : null,
	// hash of current titles
	current : {},
	// currently selected title
	title : null,
	// word count
	wordcount : 0,

	getBaseUrl : function() {
		return "/quizreader" + this.language + "/";
	},

	getCoverUrl : function() {
		return this.getBaseUrl() + this.title.path + "/cover.html";
	},

	getDefinitionUrl : function(word) {
		var prefix = word.length > 1 ? word.substring(0, 2) : word[0];
		return this.getBaseUrl() + "def/" + prefix + "/" + word + ".json";
	},

	getLibraryUrl : function() {
		return this.getBaseUrl() + "idx.json";
	},

	getPageUrl : function(section) {
		var name = '' + section;
		while (name.length < 3) {
			name = "0" + name;
		}
		return this.getBaseUrl() + this.title.path + "/t" + name + ".html";
	}
};

// Handlebars init
Handlebars.registerHelper("libpath", function() {
	return qr.getBaseUrl();
});

// ---------------------- init methods

function checkDb(callback) {
	if (qr.dao) {
		callback();
	} else if (indexeddao.isSupported()) {
		qr.dao = indexeddao;
		qr.dao.open(function() {
			quizmanager.init(qr.dao, function() {
				settingsmanager.init(qr.dao, function() {
					callback();
				});
			});
		});
	} else {
		alert("Your browser does not support saving data, you can test the app but will not be able to save your progress");
		qr.dao = memorydao;
		callback();
	}
}

function checkLanguage(callback) {
	if (qr.language) {
		return callback();
	}
	return checkDb(function() {
		qr.dao.getLanguages(function(data) {
			if (data.length > 1) {
				$.mobile.changePage("#language_choice");
			} else if (data.length == 0) { // no existing languages
				$.mobile.changePage("#language_add");
			} else {
				qr.language = data[0].code;
				qr.dao.getWordCount(function(count) {
					$(".wordcount").text(count);
					qr.wordcount = count;
					callback();
				});
			}
		});
	});
}

function checkTitle(callback) {
	if (qr.title) {
		return callback();
	}
	return checkLanguage(function() {
		$.mobile.changePage("#current");
	});
}

// ---------------------- common methods

function showError(xhr) {
	var source = $("#error_template").html();
	var template = Handlebars.compile(source);
	$("#error_cell").html(template(xhr));
	$.mobile.changePage("#error");
}

function getJSON(url, callback) {
	$.getJSON(url).done(function(data) {
		callback(data);
	}).fail(function(xhr) {
		showError(xhr);
	});
}

function getRoot(data) {
	return data.definitions[0] ? data.definitions[0].root : null;
}

// ---------------------- language add

$(document).delegate("#language_add", "pageinit", function() {
	var source = $("#add_language_template").html();
	var template = Handlebars.compile(source);
	$(document).on('pagebeforeshow', '#language_add', function(e, data) {
		checkDb(function() {
			var languages = [ {
				code : "es",
				name : "Spanish"
			}, {
				code : "fr",
				name : "French"
			}, {
				code : "de",
				name : "German"
			} ];
			qr.dao.getLanguages(function(data) {
				// turn list into hash of new languages
				var languageHash = {};
				for (var i = 0; i < languages.length; i++) {
					var code = languages[i].code;
					languageHash[code] = languages[i];
					for (var j = 0; j < data.length; j++) {
						if (code == data[j].code) {
							languages[i].inuse = true;
						}
					}
				}
				var list = $("#add_language_list");
				console.log(languages);
				list.html(template(languages)).listview("refresh");
				$("a[data-code]", list).on('click', function(e) {
					qr.language = $(this).data("code");
					qr.dao.addLanguage({
						code : qr.language,
						name : languageHash[qr.language],
						words : 0
					}, function() {
						$.mobile.changePage("#current");
					});
				});
			});
		});
	});
});

// ---------------------- language choice

$(document).delegate("#language_choice", "pageinit", function() {
	var source = $("#language_template").html();
	var template = Handlebars.compile(source);

	$(document).on('pagebeforeshow', '#language_choice', function(e, data) {
		checkLanguage(function() {
			var list = $("#language_list");
			list.html(template(qr.languages)).listview("refresh");
			$("a[data-code]", list).on('click', function(e) {
				qr.language = $(this).data("code");
				$.mobile.changePage("#current");
			});
		});
	});
});

// ---------------------- current/now reading

$(document).delegate("#current", "pagebeforecreate", function() {
	var source = $("#current_template").html();
	var template = Handlebars.compile(source);

	$(document).on('pagebeforeshow', '#current', function(e, data) {
		checkLanguage(function() {
			qr.current = {};
			qr.dao.getOpenTitles(function(data) {
				// hash current titles
				for (var i = 0; i < data.length; i++) {
					qr.current[data[i].path] = data[i];
				}
				var list = $("#current_list");
				list.html(template(data)).listview("refresh");
				$("a[data-path]", list).on('click', function(e) {
					qr.title = qr.current[$(this).data("path")];
					$.mobile.changePage("#details");
				});
			});
		});
	});
});

// ---------------------- library

$(document).delegate("#library", "pageinit", function() {
	var source = $("#library_template").html();
	var template = Handlebars.compile(source);

	// library state
	var lib = {
		language : null,
		current : null,
		prepare : function(data) {
			for (var i = 0; i < data.length; i++) {
				if (data[i].name) {
					data[i].sub = data[i].sub ? data[i].sub : [];
					data[i].sub.parent = data;
					this.prepare(data[i].sub);
				}
			}
		}
	};

	function showEntry() {
		var list = $("#library_list");
		// redo list from template
		list.html(template({
			lib : lib.current,
			libpath : qr.getBaseUrl()
		})).listview("refresh");
		// hash titles
		var titleByPath = {};
		for (var i = 0; i < lib.current.length; i++) {
			if (lib.current[i].title) {
				titleByPath[lib.current[i].path] = lib.current[i];
			}
		}
		// add event handlers to new list items
		$("a[data-path]", list).on('click', function(e) {
			qr.title = titleByPath[$(this).data("path")];
			console.log("title hash for " + $(this).data("path"));
			console.log(qr.title);
			$.mobile.changePage("#details");
		});
		$("a[data-parent]", list).on('click', function(e) {
			lib.current = lib.current.parent;
			showEntry();
		});
		$("a[data-index]", list).on('click', function(e) {
			var index = $(this).data("index");
			lib.current = lib.current[index].sub;
			showEntry();
		});
	}

	$(document).on('pagebeforeshow', '#library', function(e, data) {
		checkLanguage(function() {
			if (lib.language != qr.language) {
				// $.mobile.loading("show", {
				// text : "loading library for " + qr.language,
				// textVisible : true
				// });
				$.getJSON(qr.getLibraryUrl()).done(function(data) {
					lib.language = qr.language;
					lib.current = data;
					lib.prepare(data);
					showEntry();
				}).fail(function(foo, mesg) {
					alert(mesg);
					console.log(foo);
				});
			}
		});
	});
});

// ------------------- details

$(document).delegate("#details", "pageinit", function() {
	$("#readButton").on('click', function(e) {
		// are we already reading this title
		if (!qr.current[qr.title.path]) {
			qr.dao.addTitle(qr.title);
		}
		// read
		$.mobile.changePage("#read");
	});

	$(document).on('pagebeforeshow', '#details', function(e, data) {
		checkTitle(function() {
			$("#cover_div").load(qr.getCoverUrl());
		});
	});
});

// ------------------- reading page

$(document).delegate("#read", "pageinit", function() {

	var page = { // page elements
		chunks : [],
		// words to show definitions
		defWords : [],
		// definitions to show quizzes
		quizzes : [],
		// elements for which we are quizzing
		quizChunks : []
	};

	function popupDef(jqelem, data, root) {
		var source = $("#popup_def_template").html();
		var template = Handlebars.compile(source);

		if (root) {
			$("#popup_word1").text(root.word);
			$("#popup_def1").html(template(root));
			$("#popup_word2").text(data.word);
			$("#popup_def2").html(template(data));
		} else {
			$("#popup_word1").text(data.word);
			$("#popup_def1").html(template(data));
			$("#popup_word2").text("");
			$("#popup_def2").html("");
		}

		var pos = jqelem.position();
		$("#popup_def").popup("open", {
			x : pos.left + jqelem.width() / 2,
			y : pos.top + jqelem.height()
		});
	}

	function showPopupDefinition(jqelem, word) {
		qr.dao.updateWord(word, 1, function() {
			getJSON(qr.getDefinitionUrl(word), function(data) {
				var root = getRoot(data);
				if (root) {
					getJSON(qr.getDefinitionUrl(root), function(rdata) {
						popupDef(jqelem, data, rdata);
					});
				} else {
					popupDef(jqelem, data, null);
				}
			});
		});
	}

	function makeNextQuiz() {
		while (page.chunks.length && page.quizzes.length < 3) {
			var chunk = page.chunks.shift();
			// TODO: break if element has different parent
			page.quizzes = page.quizzes.concat(chunk.quizzes);
			page.defWords = page.defWords.concat(chunk.words);
			page.quizChunks.push(chunk);
		}
		console.log("next set of defwords: " + page.defWords)
	}

	var defSource = $("#def_template").html();
	var defTemplate = Handlebars.compile(defSource);

	function showDefinition(data) {
		// update in dao
		qr.dao.updateWord(data.word, 1, function() {
			$("#def_div").html(defTemplate(data));
			qr.wordcount++;
		});
	}

	function nextDefinition() {
		var word = page.defWords.shift();
		$.getJSON(qr.getDefinitionUrl(word)).done(function(data) {
			// check for root
			var root = getRoot(data);
			if (root) {
				// lookup root to see if known
				qr.dao.getWord(root, function(root, count) {
					if (!count) { // show root def if unknown
						$.getJSON(qr.getDefinitionUrl(root)).done(function(data) {
							page.defWords.unshift(word);
							showDefinition(data);
						});
					} else {
						showDefinition(data);
					}
				});
			} else {
				showDefinition(data);
			}
		}).always(function() {
			$("#more_button").button('enable');
		});
	}

	var correctOption; // TODO move to page object

	function labelFor(input) {
		return $("label[for='" + input + "']");
	}

	function showQuiz(entry) {
		// clear quiz form
		$("label").text("");
		$("label").removeClass("correct").removeClass("incorrect");
		$("input:radio").removeAttr('checked');
		$("input:radio").checkboxradio('refresh');
		$("input:radio").checkboxradio('enable');
		$("#quiz_def").text(entry.definitions[0].text);
		// add new quiz
		quizmanager.getQuiz(page.quizzes, entry, function(quiz) {
			correctOption = "answer" + quiz.correct;
			labelFor("answer1").text(quiz.answer[0]);
			labelFor("answer2").text(quiz.answer[1]);
			labelFor("answer3").text(quiz.answer[2]);
		});
	}

	// radio button click handler
	$("input:radio").click(function(e) {
		// disable form
		$("input:radio").checkboxradio('disable')
		$("#more_button").button('enable');
		// style the correct answer
		labelFor(correctOption).addClass("correct");
		if (this.id != correctOption) {
			// style bad answer incorrect
			labelFor(this.id).addClass("incorrect");
			// reshuffle
			page.quizzes.sort(function(a, b) {
				return Math.random() > 0.5 ? -1 : 1;
			});
		} else {
			// update word level
			qr.dao.updateWord(labelFor(this.id).text(), 2, function() {
				// auto-increment to next quiz
				var countdown = settingsmanager.getSetting("flip_delay", 3);
				(function timer() {
					// show countdown in button
					$("#more_button").val("Next (" + countdown + ")");
					// end or continue count
					if (countdown-- == 0) {
						$("#more_button").val("Next");
						next();
					} else {
						setTimeout(timer, 1000);
					}
					$("#more_button").button("refresh");
				}());
			});
		}
	});

	function nextQuiz() {
		// get next entry
		var word = page.quizzes.pop();
		$.getJSON(qr.getDefinitionUrl(word)).done(function(entry) {
			// check for root
			var root = getRoot(entry);
			if (root) {
				// lookup root to see if known
				qr.dao.getWord(root, function(root, count) {
					if (count < 2) { // show root quiz
						$.getJSON(qr.getDefinitionUrl(root)).done(function(data) {
							page.quizzes.push(word);
							showQuiz(data);
						}).fail(function() {
							next();
						});
					} else {
						showQuiz(entry);
					}
				});
			} else {
				showQuiz(entry);
			}
		}).fail(function() {
			next();
		});
	}

	function expandBubbleArea() {
		$("#bubble_div").animate({
			height : 200
		}, 1000, function() {
			$("html, body").animate({
				scrollTop : $(document).height() - $(window).height()
			}, 500);
		});
	}

	function collapseBubbleArea(callback) {
		$("#def_div").html(""); // clear()?
		$("#bubble_div").animate({
			height : 0
		}, 1000, callback);
	}

	function showElements(callback) {
		while (page.quizChunks.length) {
			var chunk = page.quizChunks.shift();
			var elem = chunk.element;
			$(elem).fadeTo(0, 0); // ?
			$(elem).show();
			$(elem).fadeTo(1000, 1.0);
			qr.title.element = chunk.index;
		}
		qr.dao.updateTitle(qr.title, function() {
			console.log("updated title element to " + qr.title.element);
		});
		$("html, body").animate({
			scrollTop : $(document).height() - $(window).height()
		}, 500, function() {
			$("#more_button").button('enable');
		});
	}

	function next() {
		$("#more_button").button('disable');
		// showing definitions
		if (page.defWords.length) {
			$("#quiz_div").hide();
			nextDefinition();
		}
		// showing quizzes
		else if (page.quizzes.length) {
			$("#def_div").hide();
			$("#quiz_div").show();
			nextQuiz();
		}
		// done showing defs/quizzes
		else if ($("#bubble_div").height() > 0) {
			$(".wordcount").text(qr.wordcount);
			collapseBubbleArea(function() {
				showElements();
			});
		}
		// need a new quiz
		else if (page.chunks.length) {
			makeNextQuiz();
			if (page.defWords.length) {
				expandBubbleArea();
				$("#def_div").show();
				nextDefinition();
			} else if (page.quizzes.length) {
				expandBubbleArea();
				$("#quiz_div").show();
				nextQuiz();
			} else {
				showElements();
			}
		}
		// at end of section
		else {
			// TODO increment section and save to database
			// loadSection(qr.title.section, 0, function() {
			// next();
			alert("end of section!");
		}
	}

	function getWord(elem) {
		return elem.data("word") ? elem.data("word") : elem.text();
	}

	function loadSection(section, elemIndex, callback) {

		// load document and process elements
		$("#text").load(qr.getPageUrl(section), function() {
			// parent elements of <a> definition tags
			var elements = $("h1,h2,h3,h4,span,li", $("#text"));

			var appearsInSection = {};
			var elementsRemaining = elements.length;
			elements.each(function(index) {
				if (index > elemIndex) {
					// new chunk object for this element
					var chunk = {
						words : [],
						quizzes : [],
						element : this,
						index : index
					};
					page.chunks.push(chunk);
					// collect unique words
					var elementWord = {};
					$("a", this).each(function() {
						var word = getWord($(this));
						// add link
						$(this).click(function(evt) {
							showPopupDefinition($(this), word);
							evt.preventDefault();
						});
						// is this word unique in this section
						if (!appearsInSection[word]) {
							appearsInSection[word] = elementWord[word] = true;
						}
					});
					// console.log("element words for element " + index + ": ")
					// console.log(elementWord)
					// lookup collected words
					var remaining = Object.keys(elementWord).length;
					if (!remaining && !--elementsRemaining) {
						callback();
					}
					for (lookupWord in elementWord) {
						qr.dao.getWord(lookupWord, function(word, count) {
							if (!count) {
								chunk.words.push(word);
							}
							if (!count || count < 2) {
								chunk.quizzes.push(word);
							}
							if (!--remaining && !--elementsRemaining) {
								callback();
							}
						});
					}
				} else {
					$(this).show(); // show elements already passed
				}
			});
		});
	}

	$("#more_button").on('click', function(e) {
		next();
	});

	$(document).on('pagebeforeshow', '#read', function(e, data) {
		checkTitle(function() {
			loadSection(qr.title.section, qr.title.element, function() {
				if (!qr.title.element) {
					next();
				}
			});
		});
	});
});

// ------------------- quiz popup

$(document).delegate("#quiz", "popupcreate", function() {

	// "Next" button
	$("#nextQuizButton").on('click', function(e) {
		nextQuiz();
	});

	$(document).on('popupbeforeposition', '#quiz', function(e, data) {
		checkTitle(function() {
			nextQuiz();
		});
	});
});

// ------------------- settings page

$(document).delegate("#settings", "pageinit", function() {

	$("#setting_save_button").on('click', function(e) {
		settingsmanager.saveSettings({
			"flip_delay" : $("#setting_flip_delay").val()
		}, function() {
			alert("settings saved!");
		});
	});

	$(document).on('pagebeforeshow', '#settings', function(e, data) {
		checkDb(function() {
			$("#setting_flip_delay").val(settingsmanager.getSetting("flip_delay", 3));
			$("#setting_flip_delay").slider("refresh");
		});
	});
});